//////////////////////////////////////////////////////////////////////
// now actual metric score calculations

import { logFilePath, logLevel } from './main'
import * as fs from 'fs'
import {
    createLintDirs,
    fetchRepoContributors,
    fetchRepoLicense,
    fetchRepoReadme,
    fetchLintOutput,
    fetchRepoIssues,
} from './metric_helpers'

const mit = "MIT" || "mit";
const apache = "Apache" || "apache";
const gpl = "GPL" || "gpl";
const bsd = "BSD" || "bsd"; 

interface RepoData {
    URL: string;
    NET_SCORE: number;
    RAMP_UP_SCORE: number;
    CORRECTNESS_SCORE: number;
    BUS_FACTOR_SCORE: number;
    LICENSE_SCORE: number;
    RESPONSIVE_MAINTAINER_SCORE: number;
}

function calcuBusFactor(x: number): number {
    const result = (Math.pow((Math.log(x + 1) / (Math.log(1500+1))), 1.22));
    //console.log(`Bus Factor: ${result}`);
    return result;
  }


function calcRampUpScore(x: number): number {
    const result = (1 - (Math.pow((Math.log(x + 1) / (Math.log(105906+1))), 1.22)));
    //console.log(`Ramp Up: ${result}`);
    return result;
}

function calcLicenseScore(x: string): number { 
    let licenseScore = 0; 
    if (x.includes(apache) || x.includes(mit) || x.includes(gpl) || x.includes(bsd)) {
        licenseScore = 1;
    } else { 
        licenseScore = 0;
    }
    //console.log(`License: ${licenseScore}`);
    return licenseScore;
}

function calcCorrectnessScore(errors: number, filecount: number) {

    // lets get the errors/warnings per file
    // we really only care about errors
 
    const errorsPerFile = errors / filecount;

    let scaledError = 0;
    let correctnessScore = 0;  
    
    if (errorsPerFile > 1 && errorsPerFile < 10) { 
        scaledError = errorsPerFile / 10;
    } else if (errorsPerFile > 10 && errorsPerFile < 100) {
        scaledError = errorsPerFile / 100;
    } else if (errorsPerFile > 100) { // if we have 100 errors per file this is not good 
        scaledError = 1; 
    }

    
    if (scaledError === 1) { // we got way too many errors per file, cannot be a good file
        correctnessScore = 0;
    }  else {
        correctnessScore = (1 - (scaledError));
    }
   
   //console.log(`Correctness: ${correctnessScore}`);
    return correctnessScore;
}


function calcRespMaintScore(timeDifference: number[], username: string, repo: string) {
    const sum = timeDifference.reduce((acc, value) => acc + value, 0);
    const avg = sum / timeDifference.length;
    let maintainer = (1 - (avg / (86400000 * 30)));
    if (maintainer < 0) { // if average response is greater than a month 
        maintainer = 0;
    } else {
        maintainer = (1 - (avg / (86400000 * 30)));
    }

    //console.log(`Responsive Maintainer: ${maintainer}`);
    
    return maintainer;
}

async function calcTotalScore(busFactor: number, rampup: number, license: number, correctness: number, maintainer: number) {
    /*
    Sarah highest priority is is not enough maintainers, we tie this into the responsive maintainer score
    responsive ^
    bus factor
        important as we dont want package to die when one person leaves
    ramp up
        she explicitly wants a good ramp up score so engineers can work with the package easier
    */ 
    const busWeight = 0.10;
    const rampupWeight = 0.20;
    const respMaintWeight = 0.30;
    const correctnessWeight = 0.40;
    const busScore = busFactor * busWeight;
    const rampupScore = rampup * rampupWeight;
    const respMaintScore = maintainer * respMaintWeight;
    const correctnessScore = correctness * correctnessWeight;
    const score = license*(busScore + rampupScore + respMaintScore + correctnessScore);
    //console.log(`Total Score: ${score.toFixed(5)}`); // can allow more or less decimal, five for now
    return score;
}

async function get_metric_info(gitDetails: { username: string, repo: string }[]): Promise<void> {
    for (let i = 0; i < gitDetails.length; i++) {
        const gitInfo = gitDetails[i];
        try {
            //console.log(`Getting Metric info for ${gitInfo.username}/${gitInfo.repo}`);
            //await fetchRepoInfo(gitInfo.username, gitInfo.repo);
            await createLintDirs(gitInfo.username, gitInfo.repo);
            const busFactor = await fetchRepoContributors(gitInfo.username, gitInfo.repo);
            const license = await fetchRepoLicense(gitInfo.username, gitInfo.repo); 
            const rampup = await fetchRepoReadme(gitInfo.username, gitInfo.repo);
            const correctness = await fetchLintOutput(gitInfo.username, gitInfo.repo);
            const maintainer = await fetchRepoIssues(gitInfo.username, gitInfo.repo);
            let score = await calcTotalScore(busFactor, rampup, license, correctness, maintainer);
            outputResults(gitInfo.username, gitInfo.repo, busFactor, rampup, license, correctness, maintainer, score);
            //console.log(`~~~~~~~~~~~~~~~~\n`);
          
        } catch (error) {
            //console.error(`Failed to get Metric info for ${gitInfo.username}/${gitInfo.repo}`);
            if(logLevel == 2){
                fs.appendFile(logFilePath, `Failed to get Metric info for ${gitInfo.username}/${gitInfo.repo}\n`, (err)=>{});
            }
        }
    }
}

async function outputResults(username: string, repo: string, busFactor: number, rampup: number, license: number, correctness: number, maintainer: number, score: number) {
    const url = `https://github.com/${username}/${repo}`;
    
    
    const repoData: RepoData = {
        URL: url,
        NET_SCORE: parseFloat(score.toFixed(5)),
        RAMP_UP_SCORE: parseFloat(rampup.toFixed(5)),
        CORRECTNESS_SCORE: parseFloat(correctness.toFixed(5)),
        BUS_FACTOR_SCORE: parseFloat(busFactor.toFixed(5)),
        LICENSE_SCORE: license,
        RESPONSIVE_MAINTAINER_SCORE: parseFloat(maintainer.toFixed(5)),
    };
    console.log(JSON.stringify(repoData));
    const ndJsonpath = `./results.ndjson`;
    fs.appendFileSync(ndJsonpath, JSON.stringify(repoData) + "\n");
    if(logLevel >= 1){
        fs.appendFileSync(logFilePath, JSON.stringify(repoData) + "\n");
    }
}

export {
    calcuBusFactor,
    calcLicenseScore,
    calcRampUpScore,
    calcCorrectnessScore,
    calcRespMaintScore,
    get_metric_info,
}
