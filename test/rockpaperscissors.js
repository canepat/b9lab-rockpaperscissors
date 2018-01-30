"use strict";

// Import the third-party libraries
const Promise = require("bluebird");

// Import the local libraries and customize the web3 environment
const addEvmFunctions = require("../utils/evmFunctions.js");

addEvmFunctions(web3);

if (typeof web3.eth.getBlockPromise !== "function") {
    Promise.promisifyAll(web3.eth, { suffix: "Promise" });
}
if (typeof web3.evm.increaseTimePromise !== "function") {
    Promise.promisifyAll(web3.evm, { suffix: "Promise" });
}
if (typeof web3.version.getNodePromise !== "function") {
    Promise.promisifyAll(web3.version, { suffix: "Promise" });
}

web3.eth.expectedExceptionPromise = require("../utils/expectedExceptionPromise.js");
web3.eth.expectedOkPromise = require("../utils/expectedOkPromise.js");
web3.eth.getPastTimestamp = require("../utils/getPastTimestamp.js");
web3.eth.getTransactionReceiptMined = require("../utils/getTransactionReceiptMined.js");
web3.eth.makeSureHasAtLeast = require("../utils/makeSureHasAtLeast.js");
web3.eth.makeSureAreUnlocked = require("../utils/makeSureAreUnlocked.js");

// Import the smart contracts
const RockPaperScissors = artifacts.require("./RockPaperScissors.sol");

contract('RockPaperScissors', function(accounts) {
    const MAX_GAS = 2000000;
    const TESTRPC_SLOW_DURATION = 1000;
    const GETH_SLOW_DURATION = 15000;
    const GAME_PRICE = web3.toWei(0.009, 'ether');
    const GAME_TIMEOUT = 2;

    let isTestRPC, isGeth, slowDuration;
    before("should identify node", function() {
        return web3.version.getNodePromise()
            .then(function(node) {
                isTestRPC = node.indexOf("EthereumJS TestRPC") >= 0;
                isGeth = node.indexOf("Geth") >= 0;
                slowDuration = isTestRPC ? TESTRPC_SLOW_DURATION : GETH_SLOW_DURATION;
            });
    });

    let coinbase, owner, player1, player2, player3;
    before("should check accounts", function() {
        assert.isAtLeast(accounts.length, 5, "not enough accounts");

        return web3.eth.getCoinbasePromise()
            .then(function (_coinbase) {
                coinbase = _coinbase;
                // Coinbase gets the rewards, making calculations difficult.
                const coinbaseIndex = accounts.indexOf(coinbase);
                if (coinbaseIndex > -1) {
                    accounts.splice(coinbaseIndex, 1);
                }
                [owner, player1, player2, player3] = accounts;
                return web3.eth.makeSureAreUnlocked(accounts);
            })
            .then(function() {
                const initial_balance = web3.toWei(1, 'ether');
                return web3.eth.makeSureHasAtLeast(coinbase, [owner, player1, player2, player3], initial_balance)
                    .then(txObj => web3.eth.getTransactionReceiptMined(txObj));
            });
    });

    let instance;
    beforeEach("should deploy a RockPaperScissors instance", function() {
        return RockPaperScissors.new(GAME_PRICE, GAME_TIMEOUT, { from: owner, gas: MAX_GAS })
            .then(function(_instance) {
                instance = _instance;
            });
    });

    describe("#RockPaperScissors()", function() {
        it("should fail if game price is zero", function() {
            this.slow(slowDuration);

            return web3.eth.expectedExceptionPromise(
                function() {
                    return RockPaperScissors.new(0, GAME_TIMEOUT, { from: owner, gas: MAX_GAS });
                },
                MAX_GAS
            );
        });
        it("should fail if game timeout in blocks is zero", function() {
            this.slow(slowDuration);

            return web3.eth.expectedExceptionPromise(
                function() {
                    return RockPaperScissors.new(GAME_PRICE, 0, { from: owner, gas: MAX_GAS });
                },
                MAX_GAS
            );
        });
        it("should return provided game price", function() {
            this.slow(slowDuration);

            return instance.gamePrice()
                .then(realGamePrice => assert.equal(GAME_PRICE, realGamePrice, "provided game price not returned"));
        });
        it("should return provided game timeout in blocks", function() {
            this.slow(slowDuration);

            return instance.gameTimeoutBlocks()
                .then(realGameTimeout => assert.equal(GAME_TIMEOUT, realGameTimeout, "provided game timeout not returned"));
        });
        it("should be enrollable after creation", function() {
            this.slow(slowDuration);

            return instance.canEnrol()
                .then(isEnrollable => assert.isTrue(isEnrollable, "created game not enrollable"));
        });
        it("should have emitted LogCreation event", function() {
            this.slow(slowDuration);

            return web3.eth.getTransactionReceiptMined(instance.transactionHash)
                .then(function(receipt) {
                    const EXPECTED_TOPIC_LENGTH = 4;
                    assert.equal(receipt.logs.length, 1); // just 1 LogCreation event

                    const logEvent = receipt.logs[0];
                    assert.equal(logEvent.topics[0], web3.sha3("LogCreation(address,uint256,uint256)"));
                    assert.equal(logEvent.topics.length, EXPECTED_TOPIC_LENGTH);

                    const EXPECTED_ARGS_LENGTH = 3;
                    const formattedEvent = instance.LogCreation().formatter(logEvent);
                    const name = formattedEvent.event;
                    const ownerArg = formattedEvent.args.owner;
                    const gamePriceArg = formattedEvent.args.gamePrice;
                    const gameTimeoutArg = formattedEvent.args.gameTimeoutBlocks;
                    assert.equal(name, "LogCreation", "LogCreation name is wrong");
                    assert.equal(ownerArg, owner, "LogCreation arg owner is wrong: " + ownerArg);
                    assert.equal(gamePriceArg, GAME_PRICE, "LogCreation arg game price is wrong: " + gamePriceArg);
                    assert.equal(gameTimeoutArg, GAME_TIMEOUT, "LogCreation arg game timeout is wrong: " + gameTimeoutArg);
                    assert.equal(Object.keys(formattedEvent.args).length, EXPECTED_ARGS_LENGTH);
                });
        });
    });

    describe("#enrol()", function() {
        it("should fail if players are already registered", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(function() {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.enrol({ from: player3, gas: MAX_GAS, value: GAME_PRICE });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if player does send zero value", function() {
            this.slow(slowDuration);

            return web3.eth.expectedExceptionPromise(
                function() {
                    return instance.enrol({ from: player1, gas: MAX_GAS, value: 0 });
                },
                MAX_GAS
            );
        });
        it("should fail if player does not send at least game price", function() {
            this.slow(slowDuration);

            return web3.eth.expectedExceptionPromise(
                function() {
                    return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE - 1 });
                },
                MAX_GAS
            );
        });
        it("should register enrolled players", function() {
            this.slow(slowDuration);

            return web3.eth.expectedOkPromise(
                function() {
                    return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                        .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }));
                },
                MAX_GAS
            )
            .then(() => instance.bet1())
            .then(bet1 => {
                assert.strictEqual(bet1[0], player1, "player1 not returned");
                return instance.bet2();
            })
            .then(bet2 => assert.strictEqual(bet2[0], player2, "player2 not returned"));
        });
        it("should have emitted LogEnrol event", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(txObj => {
                    assert.isAtMost(txObj.logs.length, txObj.receipt.logs.length);
                    assert.equal(txObj.logs.length, 1); // just 1 LogEnrol event
                    assert.equal(txObj.receipt.logs.length, 1); // just 1 LogEnrol event

                    const EXPECTED_ARG_LENGTH = 2;
                    const txLogEvent = txObj.logs[0];
                    const eventName = txLogEvent.event;
                    const callerArg = txLogEvent.args.caller;
                    const betIdArg = txLogEvent.args.betId;
                    assert.equal(eventName, "LogEnrol", "LogEnrol event name is wrong");
                    assert.equal(callerArg, player1, "LogEnrol arg caller is wrong: " + callerArg);
                    assert.equal(betIdArg, 1, "LogEnrol arg betId is wrong: " + betIdArg);

                    const EXPECTED_TOPIC_LENGTH = 3;
                    const receiptRawLogEvent = txObj.receipt.logs[0];
                    assert.equal(receiptRawLogEvent.topics[0], web3.sha3("LogEnrol(address,uint256)"));
                    assert.equal(receiptRawLogEvent.topics.length, EXPECTED_TOPIC_LENGTH);

                    const receiptLogEvent = instance.LogEnrol().formatter(receiptRawLogEvent);
                    assert.deepEqual(receiptLogEvent, txLogEvent, "LogEnrol receipt event is different from tx event");
                });
        });
    });

});
