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
    const ROCK = 0;
    const PAPER = 1;
    const SCISSORS = 2;
    const PLAYER1_SECRET = "secret1";
    const PLAYER2_SECRET = "secret2";
    const INVALID_MOVE = -1;

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
                const initial_balance = web3.toWei(3, 'ether');
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
        it("should fail if two players are already registered", function() {
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
        it("should fail if player is already registered", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(function() {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE });
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
        it("should register the first player", function() {
            this.slow(slowDuration);

            return web3.eth.expectedOkPromise(
                function() {
                    return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE });
                },
                MAX_GAS
            )
            .then(() => instance.bet1())
            .then(bet1 => {
                assert.strictEqual(bet1[0], player1, "player1 not returned");
                return instance.canPlay(player1);
            })
            .then(canPlayer1Play => assert.isTrue(canPlayer1Play, "player1 cannot play"));
        });
        it("should register the second player", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(function() {
                    return web3.eth.expectedOkPromise(
                        function() {
                            return instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE });
                        },
                        MAX_GAS
                    )
                    .then(() => instance.bet2())
                    .then(bet2 => {
                        assert.strictEqual(bet2[0], player2, "player2 not returned");
                        return instance.canPlay(player2);
                    })
                    .then(canPlayer2Play => assert.isTrue(canPlayer2Play, "player2 cannot play"));
                });
        });
        it("should have emitted LogEnrol event", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(txObj => {
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

    describe("#play()", function() {
        it("should fail if sender cannot play", function() {
            this.slow(slowDuration);

            let moveHash;
            return instance.hash(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_moveHash => {
                    moveHash = _moveHash;

                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.play(moveHash, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should store the first player's bet", function() {
            this.slow(slowDuration);

            let moveHash;
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(_moveHash => {
                    moveHash = _moveHash;
                    
                    return web3.eth.expectedOkPromise(
                        function() {
                            return instance.play(moveHash, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    )
                    .then(() => instance.bet1())
                    .then(bet1 => {
                        assert.strictEqual(bet1[0], player1, "player1 not stored");
                        assert.isTrue(bet1[1], "player1 has not played");
                        assert.strictEqual(bet1[2], moveHash, "player1 moveHash not stored");
                    })
                    .then(() => instance.canReveal(player1))
                    .then(canPlayer1Reveal => {
                        assert.isTrue(canPlayer1Reveal, "player1 cannot reveal");
                        return instance.canReveal(player2);
                    })
                    .then(canPlayer2Reveal => {
                        assert.isFalse(canPlayer2Reveal, "player2 can reveal");
                        return instance.isGameOver();
                    })
                    .then(gameOver => assert.isFalse(gameOver, "gameOver is false"));
                });
        });
        it("should store the second player's bet", function() {
            this.slow(slowDuration);
            
            let moveHash;
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => {
                    moveHash = move2Hash;
                    
                    return web3.eth.expectedOkPromise(
                        function() {
                            return instance.play(moveHash, { from: player2, gas: MAX_GAS });
                        },
                        MAX_GAS
                    )
                    .then(() => instance.bet2())
                    .then(bet2 => {
                        assert.strictEqual(bet2[0], player2, "player2 not stored");
                        assert.isTrue(bet2[1], "player2 has not played");
                        assert.strictEqual(bet2[2], moveHash, "player2 moveHash not stored");
                    })
                    .then(() => instance.canReveal(player1))
                    .then(canPlayer1Reveal => {
                        assert.isTrue(canPlayer1Reveal, "player1 cannot reveal");
                        return instance.canReveal(player2);
                    })
                    .then(canPlayer2Reveal => {
                        assert.isTrue(canPlayer2Reveal, "player2 cannot reveal");
                        return instance.isGameOver();
                    })
                    .then(gameOver => assert.isFalse(gameOver, "gameOver is false"));
                });
        });
        it("should have emitted LogPlay event", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(moveHash => instance.play(moveHash, { from: player1, gas: MAX_GAS }))
                .then(txObj => {
                    assert.equal(txObj.logs.length, 1); // just 1 LogPlay event
                    assert.equal(txObj.receipt.logs.length, 1); // just 1 LogPlay event

                    const EXPECTED_ARG_LENGTH = 2;
                    const txLogEvent = txObj.logs[0];
                    const eventName = txLogEvent.event;
                    const callerArg = txLogEvent.args.caller;
                    const betIdArg = txLogEvent.args.betId;
                    assert.equal(eventName, "LogPlay", "LogPlay event name is wrong");
                    assert.equal(callerArg, player1, "LogPlay arg caller is wrong: " + callerArg);
                    assert.equal(betIdArg, 1, "LogPlay arg betId is wrong: " + betIdArg);

                    const EXPECTED_TOPIC_LENGTH = 3;
                    const receiptRawLogEvent = txObj.receipt.logs[0];
                    assert.equal(receiptRawLogEvent.topics[0], web3.sha3("LogPlay(address,uint256)"));
                    assert.equal(receiptRawLogEvent.topics.length, EXPECTED_TOPIC_LENGTH);

                    const receiptLogEvent = instance.LogPlay().formatter(receiptRawLogEvent);
                    assert.deepEqual(receiptLogEvent, txLogEvent, "LogPlay receipt event is different from tx event");
                });
        });
    });

    describe("#reveal()", function() {
        it.skip("should fail if sender cannot reveal", function() {
            this.slow(slowDuration);
        });
        it.skip("should fail if passed move and secret do not match hash", function() {
            this.slow(slowDuration);
        });
        it.skip("should store the first reveal block", function() {
            this.slow(slowDuration);
        });
        it.skip("should store the clear move", function() {
            this.slow(slowDuration);
        });
        it.skip("should have emitted LogReveal event", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(moveHash => instance.play(moveHash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(txObj => {
                    assert.equal(txObj.logs.length, 1); // just 1 LogReveal event
                    assert.equal(txObj.receipt.logs.length, 1); // just 1 LogReveal event

                    const EXPECTED_ARG_LENGTH = 2;
                    const txLogEvent = txObj.logs[0];
                    const eventName = txLogEvent.event;
                    const callerArg = txLogEvent.args.caller;
                    const moveArg = txLogEvent.args.move;
                    assert.equal(eventName, "LogReveal", "LogReveal event name is wrong");
                    assert.equal(callerArg, player1, "LogReveal arg caller is wrong: " + callerArg);
                    assert.equal(moveArg, 1, "LogReveal arg move is wrong: " + moveArg);

                    const EXPECTED_TOPIC_LENGTH = 3;
                    const receiptRawLogEvent = txObj.receipt.logs[0];
                    assert.equal(receiptRawLogEvent.topics[0], web3.sha3("LogReveal(address,uint256)"));
                    assert.equal(receiptRawLogEvent.topics.length, EXPECTED_TOPIC_LENGTH);

                    const receiptLogEvent = instance.LogReveal().formatter(receiptRawLogEvent);
                    assert.deepEqual(receiptLogEvent, txLogEvent, "LogReveal receipt event is different from tx event");
                });
        });
    });

    describe("#chooseWinner()", function() {
        it("should fail if both moves not revealed and timeout not expired", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.chooseWinner({ from: owner, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it.skip("should choose winner according to game rules");
        it.skip("should choose player1 as winner if player2 does not reveal before timeout");
        it.skip("should choose player2 as winner if player1 does not reveal before timeout");
        it.skip("should reset the bet moves after winner chosen");
        it.skip("should transfer the award to the winner");
        it("should divide the award if the game is a draw", function() {
            this.slow(slowDuration);

            let balance1Before, balance2Before;
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(() => web3.eth.getBalance(player1))
                .then(_balance1Before => {
                    balance1Before = _balance1Before;
                    return web3.eth.getBalance(player2);
                })
                .then(_balance2Before => {
                    balance2Before = _balance2Before;
                    return instance.chooseWinner({ from: owner, gas: MAX_GAS });
                })
                .then(() => instance.winnerId())
                .then(winnerId => {
                    assert.equal(winnerId, 0, "game is not a draw");
                    return web3.eth.getBalance(player1);
                })
                .then(_balance1After => {
                    const balance1Delta = _balance1After.minus(balance1Before);
                    assert.equal(balance1Delta, GAME_PRICE, "player1 balance delta is not equal to half the award");
                    return web3.eth.getBalance(player2);
                })
                .then(_balance2After => {
                    const balance2Delta = _balance2After.minus(balance2Before);
                    assert.equal(balance2Delta, GAME_PRICE, "player2 balance delta is not equal to half the award");
                });
        });
        it("should reset the bets after winner chosen", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(PAPER, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.reveal(PAPER, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }))
                .then(() => instance.bet1())
                .then(bet1 => {
                    assert.strictEqual(bet1[0], '0x0000000000000000000000000000000000000000', "bet1 player not reset");
                    assert.isFalse(bet1[1], "bet1 played not reset");
                    assert.equal(bet1[3], INVALID_MOVE, "bet1 move not reset");
                })
                .then(() => instance.bet2())
                .then(bet2 => {
                    assert.strictEqual(bet2[0], '0x0000000000000000000000000000000000000000', "bet2 player not reset");
                    assert.isFalse(bet2[1], "bet2 played not reset");
                    assert.equal(bet2[3], INVALID_MOVE, "bet2 move not reset");
                });
        });
        it("should have emitted LogChooseWinner event", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }))
                .then(txObj => {
                    assert.equal(txObj.logs.length, 1); // just 1 LogChooseWinner event
                    assert.equal(txObj.receipt.logs.length, 1); // just 1 LogChooseWinner event

                    const EXPECTED_ARG_LENGTH = 2;
                    const txLogEvent = txObj.logs[0];
                    const eventName = txLogEvent.event;
                    const callerArg = txLogEvent.args.caller;
                    const winnerIdArg = txLogEvent.args.winnerId;
                    assert.equal(eventName, "LogChooseWinner", "LogChooseWinner event name is wrong");
                    assert.equal(callerArg, owner, "LogChooseWinner arg caller is wrong: " + callerArg);
                    assert.equal(winnerIdArg, 0, "LogChooseWinner arg winnerId is wrong: " + winnerIdArg);

                    const EXPECTED_TOPIC_LENGTH = 3;
                    const receiptRawLogEvent = txObj.receipt.logs[0];
                    assert.equal(receiptRawLogEvent.topics[0], web3.sha3("LogChooseWinner(address,uint256)"));
                    assert.equal(receiptRawLogEvent.topics.length, EXPECTED_TOPIC_LENGTH);

                    const receiptLogEvent = instance.LogChooseWinner().formatter(receiptRawLogEvent);
                    assert.deepEqual(receiptLogEvent, txLogEvent, "LogChooseWinner receipt event is different from tx event");
                });
        });
    });
});
