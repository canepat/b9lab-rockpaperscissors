const RockPaperScissors = artifacts.require("./RockPaperScissors.sol");

module.exports = function(deployer, network, accounts) {
    let owner = accounts[1];
    const gamePrice = web3.toWei(0.009, 'ether');
    const gameTimeoutBlocks = 20;
    const gasLimit = 2000000;

    if (network == "ropsten") {
        owner = ""; // TODO: fill
    }
    
    deployer.deploy(RockPaperScissors, gamePrice, gameTimeoutBlocks,
    	{ from: owner, gas: gasLimit });

};
