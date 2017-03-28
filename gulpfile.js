'use strict';

var gulp = require('gulp'),
    debug = require('gulp-debug'),
    util = require('gulp-util'),
    fs = require('fs-extra');

gulp.task("zip", function () {
    var zip = require('gulp-zip'),
        date = new Date(),
        packageName = 'package-' + 
            date.toLocaleDateString().replace(/[^0-9]/g, '-') + '--' +
            date.toLocaleTimeString().replace(/[^0-9]/g, '-') + '.zip';
                
        return gulp.src([
                '**/*',
                '.vscode/**/*',
                '!archive/*',
                '!node_modules/**/*', 
                '!build/**/*',
                '!build_production/**/*',
                '!.git/**/*',
                '!.gitignore'
            ],
            {base: "."})
            .pipe(debug({title: packageName}))
            .pipe(zip(packageName))
            .pipe(gulp.dest('archive'));
});


gulp.task('deploy:contract', function(cb) {
    let Web3 = require('web3');
    let pe = util.PluginError;
    let contract, web3, contractObject;

    try {
        contract = fs.readJsonSync(util.env.contractJSON);
    } catch(e) {        
        throw new pe('deploy-contract', `Unable read valid contract json file '${util.env.contractJSON}'`);
    }

    if (!contract.abi || !contract.bytecode) {
        throw new util.PluginError('deploy-contract', `abi or bytecode element of '${util.env.contractJSON}' json file is undefined`);
    }

    web3 = new Web3();
    web3.setProvider(new web3.providers.HttpProvider(util.env.web3HttpProvider));

    try {
        util.log(`Provider: '${web3.currentProvider.host}', api: ${web3.version.api}`);
    } catch(e) {
        throw new util.PluginError('deploy-contract', `Unable connect to provider`);
    }

    try {
        util.log(`Unlocking coinbase '${web3.eth.coinbase}' account`);
        web3.personal.unlockAccount(web3.eth.coinbase, util.env.web3CoinbasePassword.toString());
    } catch(e) {
        throw new util.PluginError('deploy-contract', `Unable unlock coinbase account`);
    }


    util.log(`Deploying contract '${util.env.contractJSON}'`);

    try {
        let contractABI = web3.eth.contract(JSON.parse(contract.abi.toString()));
        contractObject = contractABI.new({from: web3.eth.coinbase, gas: 1000000, data: '0x' + contract.bytecode.toString()});
        
        contract.transactionHash = contractObject.transactionHash;
        fs.writeJsonSync(util.env.contractJSON, contract);
        util.log(`Transaction has entered to memory pool '${contractObject.transactionHash}'`);
    } catch(e) {
        throw new util.PluginError('deploy-contract', `Unable deploy contract to memory pool`);
    }

    if (!util.env.minerStart) {
        //console.log(web3.mining);
        //web3.miner.start(1);
    }

    let waitSeconds = 120;
    let estimatedSeconds = 0;

    util.log(`Currently in block '${web3.eth.blockNumber}'`);
    util.log(`Waiting '${waitSeconds}' seconds to be mined block`);

    let sleepTimer = setInterval(function() {

        if (estimatedSeconds == waitSeconds) {
            clearInterval(sleepTimer);
            throw new util.PluginError('deploy-contract', `Deploy contract to block failed due timeout ${waitSeconds} seconds`);
        }

        estimatedSeconds++;

        //if (waitSeconds mod estimatedSeconds == 0)
        //util.log(`Estimated ${estimatedSeconds}/${estimatedSeconds} seconds`);

        let receipt = web3.eth.getTransactionReceipt(contractObject.transactionHash);
        if (receipt && receipt.contractAddress) {
            util.log(`Contract mined to block '${web3.eth.blockNumber}' at address ${receipt.contractAddress} for while ${estimatedSeconds} seconds`);
            clearInterval(sleepTimer);

            contract.contractAddress = receipt.contractAddress;
            fs.writeJsonSync(util.env.contractJSON, contract);
            return cb();
        }
      }, 1000);


});

