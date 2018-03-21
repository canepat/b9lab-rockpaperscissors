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
web3.eth.getPastBlock = require("../utils/getPastBlock.js");
web3.eth.getTransactionReceiptMined = require("../utils/getTransactionReceiptMined.js");
web3.eth.makeSureHasAtLeast = require("../utils/makeSureHasAtLeast.js");
web3.eth.makeSureAreUnlocked = require("../utils/makeSureAreUnlocked.js");

// Import the smart contracts
const RockPaperScissors = artifacts.require("./RockPaperScissors.sol");
const rockPaperScissorsTestSets = require("./rockPaperScissorsTestSets.js");

contract('RockPaperScissors', function(accounts) {
    const MAX_GAS = 4000000;
    const TESTRPC_SLOW_DURATION = 1000;
    const GETH_SLOW_DURATION = 15000;
    const GAME_PRICE = web3.toWei(0.009, 'ether');
    const GAME_TIMEOUT = 8;
    const PLAYER1_SECRET = "secret1";
    const PLAYER2_SECRET = "secret2";
    // Game moves
    const VOID = 0;
    const ROCK = 1;
    const PAPER = 2;
    const SCISSORS = 3;

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
        it("should initialize game moves as void", function() {
            this.slow(slowDuration);

            return instance.bet1()
                .then(bet1 => {
                    assert.strictEqual(0, bet1[2].toNumber(), "bet1 move not void");
                    return instance.bet2();
                })
                .then(bet2 => assert.strictEqual(0, bet2[2].toNumber(), "bet2 move not void"));
        });
        it("should be enrollable after creation", function() {
            this.slow(slowDuration);

            return instance.canEnrolAs()
                .then(betId => assert.isTrue(betId == 1 || betId == 2, "created game not enrollable to player neither 1 nor 2"));
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
                return instance.canPlayAs(player1);
            })
            .then(betId => assert.isTrue(betId == 1, "player1 cannot play as bet1"));
        });
        it("should return correct betId for the first player", function() {
            this.slow(slowDuration);

            return instance.enrol.call({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(betId => assert.strictEqual(betId.toNumber(), 1, "betId not equal to 1"));
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
                        return instance.canPlayAs(player2);
                    })
                    .then(betId => assert.isTrue(betId == 2, "player2 cannot play as bet2"));
                });
        });
        it("should return correct betId for the second player", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol.call({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(betId => assert.strictEqual(betId.toNumber(), 2, "betId not equal to 2"));
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
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
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
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
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
                        assert.strictEqual(bet1[1], moveHash, "player1 moveHash not stored");
                    })
                    .then(() => instance.canRevealAs(player1))
                    .then(betId => {
                        assert.isTrue(betId == 1, "player1 cannot reveal as bet1");
                        return instance.canRevealAs(player2);
                    })
                    .then(betId => {
                        assert.isTrue(betId == 0, "player2 cannot reveal");
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
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
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
                        assert.strictEqual(bet2[1], moveHash, "player2 moveHash not stored");
                    })
                    .then(() => instance.canRevealAs(player1))
                    .then(betId => {
                        assert.isTrue(betId == 1, "player1 cannot reveal as bet1");
                        return instance.canRevealAs(player2);
                    })
                    .then(betId => {
                        assert.isTrue(betId == 2, "player2 cannot reveal as bet2");
                        return instance.isGameOver();
                    })
                    .then(gameOver => assert.isFalse(gameOver, "gameOver is false"));
                });
        });
        it("should have emitted LogPlay event", function() {
            this.slow(slowDuration);

            let moveHash;
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(_moveHash => {
                    moveHash = _moveHash;
                    return instance.play(moveHash, { from: player1, gas: MAX_GAS });
                })
                .then(txObj => {
                    assert.equal(txObj.logs.length, 1); // just 1 LogPlay event
                    assert.equal(txObj.receipt.logs.length, 1); // just 1 LogPlay event

                    const EXPECTED_ARG_LENGTH = 3;
                    const txLogEvent = txObj.logs[0];
                    const eventName = txLogEvent.event;
                    const callerArg = txLogEvent.args.caller;
                    const betIdArg = txLogEvent.args.betId;
                    const moveHashArg = txLogEvent.args.moveHash;
                    assert.strictEqual(eventName, "LogPlay", "LogPlay event name is wrong");
                    assert.strictEqual(callerArg, player1, "LogPlay arg caller is wrong: " + callerArg);
                    assert.strictEqual(betIdArg.toNumber(), 1, "LogPlay arg betId is wrong: " + betIdArg);
                    assert.strictEqual(moveHashArg, moveHash, "LogPlay arg moveHash is wrong: " + moveHashArg);

                    const EXPECTED_TOPIC_LENGTH = 4;
                    const receiptRawLogEvent = txObj.receipt.logs[0];
                    assert.equal(receiptRawLogEvent.topics[0], web3.sha3("LogPlay(address,uint256,bytes32)"));
                    assert.equal(receiptRawLogEvent.topics.length, EXPECTED_TOPIC_LENGTH);

                    const receiptLogEvent = instance.LogPlay().formatter(receiptRawLogEvent);
                    assert.deepEqual(receiptLogEvent, txLogEvent, "LogPlay receipt event is different from tx event");
                });
        });
    });

    describe("#reveal()", function() {
        it("should fail if sender cannot reveal", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, PAPER, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.reveal(PAPER, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if passed move is invalid", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, 4, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(moveHash => instance.play(moveHash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.reveal(4, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if passed move is void", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, VOID, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(moveHash => instance.play(moveHash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.reveal(VOID, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if passed move and secret do not match hash because of move", function() {
            this.slow(slowDuration);
        
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, SCISSORS, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(moveHash => instance.play(moveHash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.reveal(PAPER, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if passed move and secret do not match hash because of secret", function() {
            this.slow(slowDuration);
        
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, SCISSORS, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(moveHash => instance.play(moveHash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.reveal(SCISSORS, "aaa", { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should store the game start block", function() {
            this.slow(slowDuration);

            let gameStartBlock;
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.gameStartBlock())
                .then(_gameStartBlock => {
                    gameStartBlock = _gameStartBlock;
                    return web3.eth.getBlock('latest');
                })
                .then(block => assert.strictEqual(block.number, gameStartBlock.toNumber(),
                    "game start block is not latest block number"));
        });
        it("should store each move in clear", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(moveHash => instance.play(moveHash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, PAPER, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.reveal(PAPER, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(() => instance.bet1())
                .then(bet1 => assert.strictEqual(bet1[2].toNumber(), ROCK, "move1 not stored in clear"))
                .then(() => instance.bet2())
                .then(bet2 => assert.strictEqual(bet2[2].toNumber(), PAPER, "move2 not stored in clear"));
        });
        it("should have emitted LogReveal event", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(moveHash => instance.play(moveHash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(txObj => {
                    assert.equal(txObj.logs.length, 1); // just 1 LogReveal event
                    assert.equal(txObj.receipt.logs.length, 1); // just 1 LogReveal event

                    const EXPECTED_ARG_LENGTH = 3;
                    const txLogEvent = txObj.logs[0];
                    const eventName = txLogEvent.event;
                    const callerArg = txLogEvent.args.caller;
                    const betIdArg = txLogEvent.args.betId;
                    const moveArg = txLogEvent.args.move;
                    assert.equal(eventName, "LogReveal", "LogReveal event name is wrong");
                    assert.equal(callerArg, player1, "LogReveal arg caller is wrong: " + callerArg);
                    assert.equal(betIdArg, 1, "LogReveal arg betId is wrong: " + betIdArg);
                    assert.equal(moveArg, 1, "LogReveal arg move is wrong: " + moveArg);

                    const EXPECTED_TOPIC_LENGTH = 4;
                    const receiptRawLogEvent = txObj.receipt.logs[0];
                    assert.equal(receiptRawLogEvent.topics[0], web3.sha3("LogReveal(address,uint256,uint256)"));
                    assert.equal(receiptRawLogEvent.topics.length, EXPECTED_TOPIC_LENGTH);

                    const receiptLogEvent = instance.LogReveal().formatter(receiptRawLogEvent);
                    assert.deepEqual(receiptLogEvent, txLogEvent, "LogReveal receipt event is different from tx event");
                });
        });
    });

    describe("#chooseWinner()", function() {
        it("should fail if game is not over", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
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
        describe("should choose winner according to game rules", function() {
            this.slow(slowDuration);

            describe("forbidden", function() {
                const invalidTestSet = rockPaperScissorsTestSets.invalidTestSet;

                invalidTestSet.forEach(function(invalidTest) {
                    const move1 = invalidTest.move1;
                    const move2 = invalidTest.move2;

                    it(`should forbid move1 ${move1} and move2 ${move2}`, function() {
                        this.slow(slowDuration);

                        return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                            .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                            .then(() => instance.hash(player1, move1, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                            .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                            .then(() => instance.hash(player2, move2, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                            .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                            .then(() => {
                                return web3.eth.expectedExceptionPromise(
                                    function() {
                                        return instance.reveal(move1, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                                            .then(() => instance.reveal(move2, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }));
                                    },
                                    MAX_GAS
                                );                                
                            });
                    });
                });
            });

            describe("allowed", function() {
                const validTestSet = rockPaperScissorsTestSets.validTestSet;

                validTestSet.forEach(function(validTest) {
                    const move1 = validTest.move1;
                    const move2 = validTest.move2;
                    const winner = validTest.winner;

                    it(`should allow move1 ${move1} and move2 ${move2} with winner ${winner}`, function() {
                        this.slow(slowDuration);

                        return web3.eth.expectedOkPromise(
                            function() {
                                return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                                    .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                                    .then(() => instance.hash(player1, move1, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                                    .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                                    .then(() => instance.hash(player2, move2, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                                    .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                                    .then(() => instance.reveal(move1, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                                    .then(() => instance.reveal(move2, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                                    .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }));
                            },
                            MAX_GAS
                        )
                        .then(() => instance.winnerId())
                        .then(winnerId => {
                            assert.equal(winnerId.toNumber(), winner, `game winner is not ${winner} with [${move1}, ${move2}]`);
                            return winnerId;
                        });
                    });
                });
            });
        });
        it("should choose no winner if player2 does not enrol before timeout", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.gameStartBlock())
                .then(gameStartBlock => web3.eth.getPastBlock(gameStartBlock.plus(GAME_TIMEOUT)))
                .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }))
                .then(() => instance.winnerId())
                .then(winnerId => assert.strictEqual(winnerId.toNumber(), 0, "game is not draw"));
        });
        it("should choose no winner if player2 does not play before timeout", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, PAPER, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.gameStartBlock())
                .then(gameStartBlock => web3.eth.getPastBlock(gameStartBlock.plus(GAME_TIMEOUT)))
                .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }))
                .then(() => instance.winnerId())
                .then(winnerId => assert.strictEqual(winnerId.toNumber(), 0, "game is not draw"));
        });
        it("should choose no winner if player1 does not enrol before timeout", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.gameStartBlock())
                .then(gameStartBlock => web3.eth.getPastBlock(gameStartBlock.plus(GAME_TIMEOUT)))
                .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }))
                .then(() => instance.winnerId())
                .then(winnerId => assert.strictEqual(winnerId.toNumber(), 0, "game is not draw"));
        });
        it("should choose no winner if player1 does not play before timeout", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player2, PAPER, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.gameStartBlock())
                .then(gameStartBlock => web3.eth.getPastBlock(gameStartBlock.plus(GAME_TIMEOUT)))
                .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }))
                .then(() => instance.winnerId())
                .then(winnerId => assert.strictEqual(winnerId.toNumber(), 0, "game is not draw"));
        });
        it("should choose player1 as winner if player2 does not reveal before timeout", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, PAPER, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, SCISSORS, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(PAPER, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.gameStartBlock())
                .then(gameStartBlock => web3.eth.getPastBlock(gameStartBlock.plus(GAME_TIMEOUT)))
                .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }))
                .then(() => instance.winnerId())
                .then(winnerId => assert.equal(winnerId, 1, "game winner is not player1"));
        });
        it("should choose player2 as winner if player1 does not reveal before timeout", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, SCISSORS, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, PAPER, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(PAPER, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(() => instance.gameStartBlock())
                .then(gameStartBlock => web3.eth.getPastBlock(gameStartBlock.plus(GAME_TIMEOUT)))
                .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }))
                .then(() => instance.winnerId())
                .then(winnerId => assert.equal(winnerId, 2, "game winner is not player2"));
        });
        it("should transfer the award to the winner", function() {
            this.slow(slowDuration);

            let balance1Before, balance2Before;
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, PAPER, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.reveal(PAPER, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(() => instance.balances(player1))
                .then(_balance1Before => {
                    balance1Before = _balance1Before;
                    return instance.balances(player2);
                })
                .then(_balance2Before => {
                    balance2Before = _balance2Before;
                    return instance.chooseWinner({ from: owner, gas: MAX_GAS });
                })
                .then(() => instance.winnerId())
                .then(winnerId => {
                    assert.equal(winnerId, 2, "game winner is not player2");
                    return instance.balances(player1);
                })
                .then(_balance1After => {
                    const balance1Delta = _balance1After.minus(balance1Before);
                    assert.equal(balance1Delta, 0, "player1 balance delta is not zero");
                    return instance.balances(player2);
                })
                .then(_balance2After => {
                    const balance2Delta = _balance2After.minus(balance2Before);
                    assert.equal(balance2Delta, 2 * GAME_PRICE, "player2 balance delta is not equal to the award");
                });
        });
        it("should divide the award if the game is a draw", function() {
            this.slow(slowDuration);

            let balance1Before, balance2Before;
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(() => instance.balances(player1))
                .then(_balance1Before => {
                    balance1Before = _balance1Before;
                    return instance.balances(player2);
                })
                .then(_balance2Before => {
                    balance2Before = _balance2Before;
                    return instance.chooseWinner({ from: owner, gas: MAX_GAS });
                })
                .then(() => instance.winnerId())
                .then(winnerId => {
                    assert.equal(winnerId, 0, "game is not a draw");
                    return instance.balances(player1);
                })
                .then(_balance1After => {
                    const balance1Delta = _balance1After.minus(balance1Before);
                    assert.equal(balance1Delta, GAME_PRICE, "player1 balance delta is not equal to half the award");
                    return instance.balances(player2);
                })
                .then(_balance2After => {
                    const balance2Delta = _balance2After.minus(balance2Before);
                    assert.equal(balance2Delta, GAME_PRICE, "player2 balance delta is not equal to half the award");
                });
        });
        it("should return its wager to first player if another one does not enrol before timeout", function() {
            this.slow(slowDuration);

            let balance1Before;
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.gameStartBlock())
                .then(gameStartBlock => web3.eth.getPastBlock(gameStartBlock.plus(GAME_TIMEOUT)))
                .then(() => instance.balances(player1))
                .then(_balance1Before => {
                    balance1Before = _balance1Before;
                    return instance.chooseWinner({ from: owner, gas: MAX_GAS });
                })
                .then(() => instance.balances(player1))
                .then(_balance1After => {
                    const balance1Delta = _balance1After.minus(balance1Before);
                    assert.equal(balance1Delta, GAME_PRICE, "player1 wager not returned after missing enrol");
                });
        });
        it("should return its wager to player1 if player2 does not play before timeout", function() {
            this.slow(slowDuration);

            let balance1Before;
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.gameStartBlock())
                .then(gameStartBlock => web3.eth.getPastBlock(gameStartBlock.plus(GAME_TIMEOUT)))
                .then(() => instance.balances(player1))
                .then(_balance1Before => {
                    balance1Before = _balance1Before;
                    return instance.chooseWinner({ from: owner, gas: MAX_GAS });
                })
                .then(() => instance.balances(player1))
                .then(_balance1After => {
                    const balance1Delta = _balance1After.minus(balance1Before);
                    assert.equal(balance1Delta, GAME_PRICE, "player1 wager not returned after missing play");
                });
        });
        it("should return its wager to player2 if player1 does not play before timeout", function() {
            this.slow(slowDuration);

            let balance2Before;
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.gameStartBlock())
                .then(gameStartBlock => web3.eth.getPastBlock(gameStartBlock.plus(GAME_TIMEOUT)))
                .then(() => instance.balances(player2))
                .then(_balance2Before => {
                    balance2Before = _balance2Before;
                    return instance.chooseWinner({ from: owner, gas: MAX_GAS });
                })
                .then(() => instance.balances(player2))
                .then(_balance2After => {
                    const balance2Delta = _balance2After.minus(balance2Before);
                    assert.equal(balance2Delta, GAME_PRICE, "player2 wager not returned after missing play");
                });
        });
        it("should reset the bets after winner chosen", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, PAPER, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.reveal(PAPER, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }))
                .then(() => instance.bet1())
                .then(bet1 => {
                    assert.strictEqual(bet1[0], '0x0000000000000000000000000000000000000000', "bet1 player not reset");
                    assert.equal(bet1[2], VOID, "bet1 move not reset");
                })
                .then(() => instance.bet2())
                .then(bet2 => {
                    assert.strictEqual(bet2[0], '0x0000000000000000000000000000000000000000', "bet2 player not reset");
                    assert.equal(bet2[2], VOID, "bet2 move not reset");
                });
        });
        it("should have emitted LogChooseWinner event", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
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

    describe("#withdraw()", function() {
        it("should fail if caller deposit is zero", function() {
            this.slow(slowDuration);

            return instance.balances(player1)
                .then(balance => assert.equal(balance, 0, "caller deposit is not zero"))
                .then(function() {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.withdraw({ from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should clear caller deposit", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }))
                .then(() => instance.withdraw({ from: player1, gas: MAX_GAS }))
                .then(() => instance.balances(player1))
                .then(balance1 => assert.equal(balance1, 0, "player1 balance not zero"))
                .then(() => instance.withdraw({ from: player2, gas: MAX_GAS }))
                .then(() => instance.balances(player2))
                .then(balance2 => assert.equal(balance2, 0, "player2 balance not zero"));
        });
        it("should increase caller balance", function() {
            this.slow(slowDuration);

            let balance1Before, balance2Before, txObj, gasPrice, withdraw1TxCost, withdraw2TxCost;
            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }))
                .then(() => web3.eth.getBalancePromise(player1))
                .then(balance1 => balance1Before = balance1)
                .then(() => instance.withdraw({ from: player1, gas: MAX_GAS }))
                .then(_txObj => {
                    txObj = _txObj;
                    return web3.eth.getTransactionPromise(txObj.tx);
                })
                .then(tx => {
                    gasPrice = tx.gasPrice;
                    withdraw1TxCost = gasPrice * txObj.receipt.gasUsed;
                    return web3.eth.getBalancePromise(player1);
                })
                .then(balance1 => {
                    const balance1Diff = balance1.minus(balance1Before).plus(withdraw1TxCost);
                    assert.equal(balance1Diff, GAME_PRICE, "player1 balance not increased")
                })
                .then(() => web3.eth.getBalancePromise(player2))
                .then(balance2 => balance2Before = balance2)
                .then(() => instance.withdraw({ from: player2, gas: MAX_GAS }))
                .then(_txObj => {
                    txObj = _txObj;
                    return web3.eth.getTransactionPromise(txObj.tx);
                })
                .then(tx => {
                    gasPrice = tx.gasPrice;
                    withdraw2TxCost = gasPrice * txObj.receipt.gasUsed;
                    return web3.eth.getBalancePromise(player2);
                })
                .then(balance2 => {
                    const balance2Diff = balance2.minus(balance2Before).plus(withdraw2TxCost);
                    assert.equal(balance2Diff, GAME_PRICE, "player2 balance not increased")
                });
        });
        it("should have emitted LogWithdraw event", function() {
            this.slow(slowDuration);

            return instance.enrol({ from: player1, gas: MAX_GAS, value: GAME_PRICE })
                .then(() => instance.enrol({ from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(move1Hash => instance.play(move1Hash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.hash(player2, SCISSORS, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(move2Hash => instance.play(move2Hash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.reveal(ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.reveal(SCISSORS, PLAYER2_SECRET, { from: player2, gas: MAX_GAS }))
                .then(() => instance.chooseWinner({ from: owner, gas: MAX_GAS }))
                .then(() => instance.withdraw({ from: player1, gas: MAX_GAS }))
                .then(txObj => {
                    assert.isAtMost(txObj.logs.length, txObj.receipt.logs.length);
                    assert.equal(txObj.logs.length, 1); // just 1 LogWithdraw event
                    assert.equal(txObj.receipt.logs.length, 1); // just 1 LogWithdraw event

                    const EXPECTED_ARG_LENGTH = 2;
                    const txLogEvent = txObj.logs[0];
                    const eventName = txLogEvent.event;
                    const playerArg = txLogEvent.args.player;
                    const amountArg = txLogEvent.args.amount;
                    assert.equal(eventName, "LogWithdraw", "LogWithdraw name is wrong");
                    assert.equal(playerArg, player1, "LogWithdraw arg player is wrong: " + playerArg);
                    assert.equal(amountArg, GAME_PRICE*2, "LogWithdraw arg amount is wrong: " + amountArg);
                    assert.equal(Object.keys(txLogEvent.args).length, EXPECTED_ARG_LENGTH);

                    const EXPECTED_TOPIC_LENGTH = 3;
                    const receiptRawLogEvent = txObj.receipt.logs[0];
                    assert.equal(receiptRawLogEvent.topics[0], web3.sha3("LogWithdraw(address,uint256)"));
                    assert.equal(receiptRawLogEvent.topics.length, EXPECTED_TOPIC_LENGTH);

                    const receiptLogEvent = instance.LogWithdraw().formatter(receiptRawLogEvent);
                    assert.deepEqual(receiptLogEvent, txLogEvent, "LogWithdraw receipt event is different from tx event");
                });
        });
    });

    describe("#hash()", function() {
        it("should use the sender to calculate hashed move", function() {
            this.slow(slowDuration);

            let move1Hash;
            return instance.hash(player1, ROCK, "secret", { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.hash(player2, ROCK, "secret", { from: player1, gas: MAX_GAS });
                })
                .then(_move2Hash => {
                    assert.notEqual(move1Hash, _move2Hash, "Sender is ignored in hash calculation");
                });
        });
        it("should use the move to calculate hashed move", function() {
            this.slow(slowDuration);

            let move1Hash;
            return instance.hash(player1, ROCK, "secret", { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.hash(player1, PAPER, "secret", { from: player1, gas: MAX_GAS });
                })
                .then(_move2Hash => {
                    assert.notEqual(move1Hash, _move2Hash, "Move is ignored in hash calculation");
                });
        });
        it("should use the secret to calculate hashed move", function() {
            this.slow(slowDuration);

            let move1Hash;
            return instance.hash(player1, ROCK, "secret", { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.hash(player1, ROCK, "another_secret", { from: player1, gas: MAX_GAS });
                })
                .then(_move2Hash => {
                    assert.notEqual(move1Hash, _move2Hash, "Secret is ignored in hash calculation");
                });
        });
        it("should not use anything else to calculate hashed move", function() {
            this.slow(slowDuration);

            let move1Hash;
            return instance.hash(player1, ROCK, "secret", { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.hash(player1, ROCK, "secret", { from: player1, gas: MAX_GAS });
                })
                .then(_move2Hash => {
                    assert.strictEqual(move1Hash, _move2Hash, "Something else is used in hash calculation");
                });
        });
    });
});
