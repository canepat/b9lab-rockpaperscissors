"use strict";

// Import the third-party libraries
const Promise = require("bluebird");
const Web3Utils = require("web3-utils");

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
    const TESTRPC_SLOW_DURATION = 10000;
    const GETH_SLOW_DURATION = 120000;
    const GAME_PRICE = web3.toBigNumber(web3.toWei(0.009, 'ether'));
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
        return RockPaperScissors.new({ from: owner, gas: MAX_GAS })
            .then(function(_instance) {
                instance = _instance;
            });
    });

    describe("#startGame()", function() {
        it("should fail if hashed move1 is zero", function() {
            this.slow(slowDuration);

            return web3.eth.expectedExceptionPromise(
                function() {
                    return instance.startGame(0, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS });
                },
                MAX_GAS
            );
        });
        it("should fail if player2 is zero", function() {
            this.slow(slowDuration);

            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(move1Hash => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.startGame(move1Hash, 0, GAME_PRICE, GAME_TIMEOUT,
                                { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if game price is zero", function() {
            this.slow(slowDuration);

            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(move1Hash => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.startGame(move1Hash, player2, 0, GAME_TIMEOUT,
                                { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if game timeout in blocks is zero", function() {
            this.slow(slowDuration);

            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(move1Hash => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.startGame(move1Hash, player2, GAME_PRICE, 0,
                                { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if first player does not pay the game price", function() {
            this.slow(slowDuration);

            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(move1Hash => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                                { from: player1, gas: MAX_GAS, value: GAME_PRICE.minus(1) });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if game is already started", function() {
            this.slow(slowDuration);

            let move1Hash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                                { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should initialize game with parameters and default values", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash, block;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.gamePrice(gameHash))
                .then(gamePrice => assert.strictEqual(gamePrice.toNumber(), GAME_PRICE.toNumber(),
                    "provided game price not returned"))
                .then(() => instance.gameTimeoutBlocks(gameHash))
                .then(gameTimeoutBlocks => assert.strictEqual(gameTimeoutBlocks.toNumber(), GAME_TIMEOUT,
                    "provided game timeout blocks not returned"))
                .then(() => web3.eth.getBlockPromise('latest'))
                .then(_block => {
                    block = _block;
                    return instance.gameStartBlock(gameHash);
                })
                .then(gameStartBlock => assert.strictEqual(gameStartBlock.toNumber(), block.number,
                    "game start block is not latest"))
                .then(() => instance.gamePlayer1(gameHash))
                .then(gamePlayer1 => assert.strictEqual(gamePlayer1, player1, "game player1 not returned"))
                .then(() => instance.gameMoveHash1(gameHash))
                .then(hashedMove1 => assert.strictEqual(hashedMove1, move1Hash,
                    "game move1Hash not returned"))
                .then(() => instance.gameMove1(gameHash))
                .then(gameMove1 => assert.strictEqual(gameMove1.toNumber(), VOID, "game move1 not VOID"))
                .then(() => instance.gamePlayer2(gameHash))
                .then(gamePlayer2 => assert.strictEqual(gamePlayer2, player2, "game player2 not returned"))
                .then(() => instance.gameMoveHash2(gameHash))
                .then(hashedMove2 => assert.strictEqual(web3.toBigNumber(hashedMove2).toNumber(), 0,
                    "game move2Hash not returned"))
                .then(() => instance.gameMove2(gameHash))
                .then(gameMove2 => assert.strictEqual(gameMove2.toNumber(), VOID, "game move2 not VOID"));
        });
        it("should have emitted LogGameCreated event", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(txObj => web3.eth.getTransactionReceiptMined(txObj.tx))
                .then(receipt => {
                    const EXPECTED_TOPIC_LENGTH = 4;
                    assert.equal(receipt.logs.length, 1); // just 1 LogGameCreated event

                    const logEvent = receipt.logs[0];
                    assert.equal(logEvent.topics[0], web3.sha3("LogGameCreated(address,address,bytes32,uint256,uint256)"));
                    assert.equal(logEvent.topics.length, EXPECTED_TOPIC_LENGTH);

                    const EXPECTED_ARGS_LENGTH = 5;
                    const formattedEvent = instance.LogGameCreated().formatter(logEvent);
                    const name = formattedEvent.event;
                    const player1Arg = formattedEvent.args.player1;
                    const player2Arg = formattedEvent.args.player2;
                    const gameHashArg = formattedEvent.args.gameHash;
                    const gamePriceArg = formattedEvent.args.gamePrice;
                    const gameTimeoutArg = formattedEvent.args.gameTimeoutBlocks;
                    assert.strictEqual(name, "LogGameCreated", "LogGameCreated name is wrong");
                    assert.strictEqual(player1Arg, player1, "LogGameCreated arg player1 is wrong: " + player1Arg);
                    assert.strictEqual(player2Arg, player2, "LogGameCreated arg player2 is wrong: " + player2Arg);
                    assert.strictEqual(gameHashArg, gameHash, "LogGameCreated arg gameHash is wrong: " + gameHashArg);
                    assert.equal(gamePriceArg.toNumber(), GAME_PRICE.toNumber(),
                        "LogGameCreated arg game price is wrong: " + gamePriceArg);
                    assert.equal(gameTimeoutArg.toNumber(), GAME_TIMEOUT,
                        "LogGameCreated arg game timeout is wrong: " + gameTimeoutArg);
                    assert.equal(Object.keys(formattedEvent.args).length, EXPECTED_ARGS_LENGTH);
                });
        });
    });

    describe("#joinGame()", function() {
        it("should fail if game hash is zero", function() {
            this.slow(slowDuration);

            return web3.eth.expectedExceptionPromise(
                function() {
                    return instance.joinGame(0, ROCK, { from: player2, gas: MAX_GAS, value: GAME_PRICE });
                },
                MAX_GAS
            );
        });
        it("should fail if game move is VOID", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.joinGame(gameHash, VOID,
                                { from: player2, gas: MAX_GAS, value: GAME_PRICE });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if game move is out of range", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.joinGame(gameHash, 4,
                                { from: player2, gas: MAX_GAS, value: GAME_PRICE });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if the game is over because both moves were made", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => {
                    return instance.joinGame(gameHash, PAPER,
                        { from: player2, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.joinGame(gameHash, PAPER,
                                { from: player2, gas: MAX_GAS, value: GAME_PRICE });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if the game is over because timeout has expired", function() {
            this.slow(slowDuration);
            
            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => web3.eth.getBlockPromise('latest'))
                .then(latest => web3.eth.getPastBlock(latest.number + GAME_TIMEOUT))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.joinGame(gameHash, PAPER,
                                { from: player2, gas: MAX_GAS, value: GAME_PRICE });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if second player does send zero value", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if second player does not send at least game price", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.joinGame(gameHash, PAPER,
                                { from: player2, gas: MAX_GAS, value: GAME_PRICE.minus(1) });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if game has not been started yet", function() {
            this.slow(slowDuration);

            return web3.eth.expectedExceptionPromise(
                function() {
                    const gameHash = Web3Utils.soliditySha3(player1, player2);

                    return instance.joinGame(gameHash, PAPER,
                        { from: player2, gas: MAX_GAS, value: GAME_PRICE });
                },
                MAX_GAS
            );
        });
        it("should register the second player move", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => {
                    return web3.eth.expectedOkPromise(
                        function() {
                            return instance.joinGame(gameHash, PAPER,
                                { from: player2, gas: MAX_GAS, value: GAME_PRICE });
                        },
                        MAX_GAS
                    );
                })
                .then(() => instance.gameMove2(gameHash))
                .then(move2 => assert.strictEqual(move2.toNumber(), PAPER,
                    "second player move not registered"));
        });
        it("should have emitted LogGameJoined event", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(txObj => web3.eth.getTransactionReceiptMined(txObj.tx))
                .then(receipt => {
                    const EXPECTED_TOPIC_LENGTH = 4;
                    assert.equal(receipt.logs.length, 1); // just 1 LogGameJoined event

                    const logEvent = receipt.logs[0];
                    assert.equal(logEvent.topics[0], web3.sha3("LogGameJoined(address,address,bytes32,uint8)"));
                    assert.equal(logEvent.topics.length, EXPECTED_TOPIC_LENGTH);

                    const EXPECTED_ARGS_LENGTH = 4;
                    const formattedEvent = instance.LogGameJoined().formatter(logEvent);
                    const name = formattedEvent.event;
                    const player1Arg = formattedEvent.args.player1;
                    const player2Arg = formattedEvent.args.player2;
                    const gameHashArg = formattedEvent.args.gameHash;
                    const move2Arg = formattedEvent.args.move2;
                    assert.strictEqual(name, "LogGameJoined", "LogGameJoined name is wrong");
                    assert.strictEqual(player1Arg, player1, "LogGameJoined arg player1 is wrong: " + player1Arg);
                    assert.strictEqual(player2Arg, player2, "LogGameJoined arg player2 is wrong: " + player2Arg);
                    assert.strictEqual(gameHashArg, gameHash, "LogGameJoined arg gameHash is wrong: " + gameHashArg);
                    assert.equal(move2Arg.toNumber(), PAPER, "LogGameJoined arg move2 is wrong: " + move2Arg);
                    assert.equal(Object.keys(formattedEvent.args).length, EXPECTED_ARGS_LENGTH);
                });
        });
    });

    describe("#revealGame()", function() {
        it("should fail if game hash is zero", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.revealGame(0, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if game move is VOID", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.revealGame(gameHash, VOID, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if game move is out of range", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.revealGame(gameHash, 4, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if the game is over because both moves were made", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.revealGame(gameHash, ROCK, PLAYER1_SECRET,
                                { from: player2, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if the game is over because timeout has expired", function() {
            this.slow(slowDuration);
            
            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => web3.eth.getBlockPromise('latest'))
                .then(latest => web3.eth.getPastBlock(latest.number + GAME_TIMEOUT))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.revealGame(gameHash, ROCK, PLAYER1_SECRET,
                                { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if game has not been started yet", function() {
            this.slow(slowDuration);

            return web3.eth.expectedExceptionPromise(
                function() {
                    const gameHash = Web3Utils.soliditySha3(player1, player2);

                    return instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                },
                MAX_GAS
            );
        });
        it("should fail if player2 has not yet arrived after timeout", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => web3.eth.getBlockPromise('latest'))
                .then(latest => web3.eth.getPastBlock(latest.number + GAME_TIMEOUT))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if passed move is invalid", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.revealGame(gameHash, 4, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if passed move is void", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.revealGame(gameHash, VOID, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if passed move and secret do not match hash because of sender", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player2, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if passed move and secret do not match hash because of move", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.revealGame(gameHash, SCISSORS, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if passed move and secret do not match hash because of secret", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.revealGame(gameHash, ROCK, PLAYER2_SECRET, { from: player1, gas: MAX_GAS });
                        },
                        MAX_GAS
                    );
                });
        });
        it("should fail if move is revealed multiple times", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => {
                    return web3.eth.expectedExceptionPromise(
                        function() {
                            return instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
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

                        let move1Hash, gameHash;
                        return instance.hash(player1, move1, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                            .then(_move1Hash => {
                                move1Hash = _move1Hash;
                                return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                                    { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                            })
                            .then(_gameHash => {
                                gameHash = _gameHash;
                                return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                                    { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                            })
                            .then(() => {
                                return web3.eth.expectedExceptionPromise(
                                    function() {
                                        return instance.joinGame(gameHash, move2,
                                            { from: player2, gas: MAX_GAS, value: GAME_PRICE })
                                                .then(() => instance.revealGame(gameHash, move1, PLAYER1_SECRET,
                                                    { from: player1, gas: MAX_GAS }));
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

                        let move1Hash, gameHash, winnerId;
                        return instance.hash(player1, move1, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                            .then(_move1Hash => {
                                move1Hash = _move1Hash;
                                return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                                    { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                            })
                            .then(_gameHash => {
                                gameHash = _gameHash;
                                return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                                    { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                            })
                            .then(() => instance.joinGame(gameHash, move2, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                            .then(() => instance.revealGame.call(gameHash, move1, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                            .then(_winnerId => {
                                winnerId = _winnerId;
                                return instance.revealGame(gameHash, move1, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                            })
                            .then(() => {
                                assert.equal(winnerId.toNumber(), winner, `winner is not ${winner} with [${move1}, ${move2}]`);
                            });
                    });
                });
            });
        });
        it("should assign the award to the winner", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash, balance1Before, balance2Before;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.balances(player1))
                .then(_balance1Before => {
                    balance1Before = _balance1Before;
                    return instance.balances(player2);
                })
                .then(_balance2Before => {
                    balance2Before = _balance2Before;
                    return instance.revealGame.call(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                })
                .then(winnerId => {
                    assert.strictEqual(winnerId.toNumber(), 2, "game winner is not player2");
                    return instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                })
                .then(() => instance.balances(player1))
                .then(_balance1After => {
                    const balance1Delta = _balance1After.minus(balance1Before);
                    assert.strictEqual(balance1Delta.toNumber(), 0, "player1 balance delta is not zero");
                    return instance.balances(player2);
                })
                .then(_balance2After => {
                    const balance2Delta = _balance2After.minus(balance2Before);
                    assert.strictEqual(balance2Delta.toNumber(), 2 * GAME_PRICE,
                        "player2 balance delta is not equal to the award");
                });
        });
        it("should divide the award if the game is a draw", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash, balance1Before, balance2Before;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, ROCK, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.balances(player1))
                .then(_balance1Before => {
                    balance1Before = _balance1Before;
                    return instance.balances(player2);
                })
                .then(_balance2Before => {
                    balance2Before = _balance2Before;
                    return instance.revealGame.call(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                })
                .then(winnerId => {
                    assert.strictEqual(winnerId.toNumber(), 0, "game winner is not empty");
                    return instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                })
                .then(() => instance.balances(player1))
                .then(_balance1After => {
                    const balance1Delta = _balance1After.minus(balance1Before);
                    assert.strictEqual(balance1Delta.toNumber(), 1*GAME_PRICE, "player1 balance delta is not its wager");
                    return instance.balances(player2);
                })
                .then(_balance2After => {
                    const balance2Delta = _balance2After.minus(balance2Before);
                    assert.strictEqual(balance2Delta.toNumber(), 1*GAME_PRICE, "player2 balance delta is not its wager");
                });
        });
        it("should reset the bets after winner chosen", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash, balance1Before, balance2Before;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.gameMoveHash1(gameHash))
                .then(moveHash1 => {
                    assert.strictEqual(moveHash1, '0x0000000000000000000000000000000000000000000000000000000000000000',
                        "game moveHash1 not reset");
                    return instance.gameMove1(gameHash);
                })
                .then(move1 => {
                    assert.strictEqual(move1.toNumber(), VOID, "game move1 not reset");
                    return instance.gameMoveHash2(gameHash);
                })
                .then(moveHash2 => {
                    assert.strictEqual(moveHash2, '0x0000000000000000000000000000000000000000000000000000000000000000',
                        "game moveHash2 not reset");
                    return instance.gameMove2(gameHash);
                })
                .then(move2 => assert.strictEqual(move2.toNumber(), VOID, "game move2 not reset"));
        });
        it("should have emitted LogGameRevealed event", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash, winnerId;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.revealGame.call(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(_winnerId => {
                    winnerId = _winnerId;
                    return instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS });
                })
                .then(txObj => web3.eth.getTransactionReceiptMined(txObj.tx))
                .then(receipt => {
                    const EXPECTED_TOPIC_LENGTH = 4;
                    assert.equal(receipt.logs.length, 1); // just 1 LogGameRevealed event

                    const logEvent = receipt.logs[0];
                    assert.equal(logEvent.topics[0], web3.sha3("LogGameRevealed(address,address,bytes32,uint8,uint256)"));
                    assert.equal(logEvent.topics.length, EXPECTED_TOPIC_LENGTH);

                    const EXPECTED_ARGS_LENGTH = 5;
                    const formattedEvent = instance.LogGameRevealed().formatter(logEvent);
                    const name = formattedEvent.event;
                    const player1Arg = formattedEvent.args.player1;
                    const player2Arg = formattedEvent.args.player2;
                    const gameHashArg = formattedEvent.args.gameHash;
                    const move1Arg = formattedEvent.args.move1;
                    const winnerIdArg = formattedEvent.args.winnerId;
                    assert.strictEqual(name, "LogGameRevealed", "LogGameRevealed name is wrong");
                    assert.strictEqual(player1Arg, player1, "LogGameRevealed arg player1 is wrong: " + player1Arg);
                    assert.strictEqual(player2Arg, player2, "LogGameRevealed arg player2 is wrong: " + player2Arg);
                    assert.strictEqual(gameHashArg, gameHash, "LogGameRevealed arg gameHash is wrong: " + gameHashArg);
                    assert.strictEqual(move1Arg.toNumber(), ROCK, "LogGameRevealed arg move1 is wrong: " + move1Arg);
                    assert.strictEqual(winnerIdArg.toNumber(), winnerId.toNumber(),
                        "LogGameRevealed arg winnerId is wrong: " + winnerIdArg);
                    assert.equal(Object.keys(formattedEvent.args).length, EXPECTED_ARGS_LENGTH);
                });
        });
    });

    describe("#claimGame()", function() {
        it("should outcome player1 as winner if player2 does not show before timeout", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash, balance1Before;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.balances(player1))
                .then(_balance1Before => {
                    balance1Before = _balance1Before;
                    return web3.eth.getBlockPromise('latest');
                })
                .then(latest => web3.eth.getPastBlock(latest.number + GAME_TIMEOUT))
                .then(() => instance.claimGame.call(gameHash, { from: player1, gas: MAX_GAS }))
                .then(winnerId => assert.strictEqual(winnerId.toNumber(), 0, "game outcome is not a draw"));
        });
        it("should outcome player2 as winner if player1 does not reveal before timeout", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash, balance1Before, balance2Before;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, ROCK, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.balances(player1))
                .then(_balance1Before => {
                    balance1Before = _balance1Before;
                    return web3.eth.getBlockPromise('latest');
                })
                .then(latest => web3.eth.getPastBlock(latest.number + GAME_TIMEOUT))
                .then(() => instance.claimGame.call(gameHash, { from: player2, gas: MAX_GAS }))
                .then(winnerId => assert.strictEqual(winnerId.toNumber(), 2, "game outcome is not player2"));
        });
        it("should return its wager to player1 if another one does not show before timeout", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash, balance1Before;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.balances(player1))
                .then(_balance1Before => {
                    balance1Before = _balance1Before;
                    return web3.eth.getBlockPromise('latest');
                })
                .then(latest => web3.eth.getPastBlock(latest.number + GAME_TIMEOUT))
                .then(() => instance.claimGame(gameHash, { from: player1, gas: MAX_GAS }))
                .then(() => instance.balances(player1))
                .then(_balance1After => {
                    const balance1Delta = _balance1After.minus(balance1Before);
                    assert.strictEqual(balance1Delta.toNumber(), 1*GAME_PRICE, "player1 balance delta is not its wager");
                });
        });
        it("should return award to player2 if player1 does not reveal before timeout", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash, balance2Before;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, PAPER, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.balances(player2))
                .then(_balance2Before => {
                    balance2Before = _balance2Before;
                    return web3.eth.getBlockPromise('latest');
                })
                .then(latest => web3.eth.getPastBlock(latest.number + GAME_TIMEOUT))
                .then(() => instance.claimGame(gameHash, { from: player2, gas: MAX_GAS }))
                .then(() => instance.balances(player2))
                .then(_balance2After => {
                    const balance2Delta = _balance2After.minus(balance2Before);
                    assert.strictEqual(balance2Delta.toNumber(), 2*GAME_PRICE, "player2 balance delta is not its wager");
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
        it("should clear the caller deposit", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, SCISSORS, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.balances(player1))
                .then(balance1 => assert.strictEqual(balance1.toNumber(), 2 * GAME_PRICE,
                    "player1 balance not equal to winner award"))
                .then(() => instance.withdraw({ from: player1, gas: MAX_GAS }))
                .then(() => instance.balances(player1))
                .then(balance1 => assert.strictEqual(balance1.toNumber(), 0, "player1 balance not zero"));
        });
        it("should increase the caller balance", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash, balance1Before, balance2Before, txObj, gasPrice, withdraw1TxCost, withdraw2TxCost;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, SCISSORS, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
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
                    assert.strictEqual(balance1Diff.toNumber(), 2 * GAME_PRICE, "player1 balance not increased")
                });
        });
        it("should have emitted LogWithdraw event", function() {
            this.slow(slowDuration);

            let move1Hash, gameHash;
            return instance.hash(player1, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS })
                .then(_move1Hash => {
                    move1Hash = _move1Hash;
                    return instance.startGame.call(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(_gameHash => {
                    gameHash = _gameHash;
                    return instance.startGame(move1Hash, player2, GAME_PRICE, GAME_TIMEOUT,
                        { from: player1, gas: MAX_GAS, value: GAME_PRICE });
                })
                .then(() => instance.joinGame(gameHash, SCISSORS, { from: player2, gas: MAX_GAS, value: GAME_PRICE }))
                .then(() => instance.revealGame(gameHash, ROCK, PLAYER1_SECRET, { from: player1, gas: MAX_GAS }))
                .then(() => instance.balances(player1))
                .then(balance1 => assert.strictEqual(balance1.toNumber(), GAME_PRICE * 2,
                    "player1 balance not equal to winner award"))
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
