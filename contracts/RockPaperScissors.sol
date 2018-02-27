pragma solidity ^0.4.13;

contract RockPaperScissors {
    event LogCreation(address indexed owner, uint256 indexed gamePrice, uint256 indexed gameTimeoutBlocks);
    event LogEnrol(address indexed caller, uint256 indexed betId);
    event LogPlay(address indexed caller, uint256 indexed betId);
    event LogReveal(address indexed caller, uint256 indexed move);
    event LogChooseWinner(address indexed caller, uint256 indexed winnerId);

    enum GameMove {
        VOID,
        ROCK,
        PAPER,
        SCISSORS
    }

    struct GameBet {
        address player;
        bytes32 moveHash;
        GameMove move;
    }

    uint256 public gamePrice;
    uint256 public gameTimeoutBlocks;
    uint256 public firstRevealBlock;
    GameBet public bet1;
    GameBet public bet2;
    uint256 public winnerId;
    mapping (uint256 => mapping (uint256 => uint256)) public rpsRules;

    function RockPaperScissors(uint256 _gamePrice, uint256 _gameTimeoutBlocks) {
        require(_gamePrice != 0);
        require(_gameTimeoutBlocks != 0);

        gamePrice = _gamePrice;
        gameTimeoutBlocks = _gameTimeoutBlocks;

        bet1.move = GameMove.VOID;
        bet2.move = GameMove.VOID;

        rpsRules[uint256(GameMove.ROCK)]    [uint256(GameMove.ROCK)]     = 0; // R + R = -
        rpsRules[uint256(GameMove.ROCK)]    [uint256(GameMove.PAPER)]    = 2; // R + P = 2
        rpsRules[uint256(GameMove.ROCK)]    [uint256(GameMove.SCISSORS)] = 1; // R + S = 1
        rpsRules[uint256(GameMove.PAPER)]   [uint256(GameMove.ROCK)]     = 1; // P + R = 1
        rpsRules[uint256(GameMove.PAPER)]   [uint256(GameMove.PAPER)]    = 0; // P + P = -
        rpsRules[uint256(GameMove.PAPER)]   [uint256(GameMove.SCISSORS)] = 2; // P + S = 2
        rpsRules[uint256(GameMove.SCISSORS)][uint256(GameMove.ROCK)]     = 2; // S + R = 2
        rpsRules[uint256(GameMove.SCISSORS)][uint256(GameMove.PAPER)]    = 1; // S + P = 1
        rpsRules[uint256(GameMove.SCISSORS)][uint256(GameMove.SCISSORS)] = 0; // S + S = -

        LogCreation(msg.sender, gamePrice, gameTimeoutBlocks);
    }
    
    function canEnrol() public constant returns (bool gameOpen) {
        return (bet1.player == 0 && bet2.player != msg.sender) || (bet1.player != msg.sender && bet2.player == 0);
    }

    function enrol() public payable {
        require(canEnrol());
        require(msg.value == gamePrice);

        if (bet1.player == 0) {
            bet1.player = msg.sender;
        }
        else {
            bet2.player = msg.sender;
        }

        LogEnrol(msg.sender, bet1.player == msg.sender ? 1 : 2);
    }

    function canPlay(address player) public constant returns (bool gamePlayable) {
        return (player == bet1.player && bet1.moveHash == 0x0) || (player == bet2.player && bet2.moveHash == 0x0);
    }

    function play(bytes32 moveHash) public {
        require(canPlay(msg.sender));
        require(moveHash != 0);

        GameBet storage bet = msg.sender == bet1.player ? bet1 : bet2;
        bet.moveHash = moveHash;

        LogPlay(msg.sender, msg.sender == bet1.player ? 1 : 2);
    }

    function canReveal(address player) public constant returns (bool gameOpen) {
        return (player == bet1.player) || (player == bet2.player && bet1.moveHash != 0x0 && bet2.moveHash != 0x0);
    }

    function reveal(GameMove move, bytes32 secret) public {
        require(canReveal(msg.sender));
        require(move != GameMove.VOID);

        if (bet1.move == GameMove.VOID && bet2.move == GameMove.VOID) {
            firstRevealBlock = block.number;
        }

        GameBet storage bet = msg.sender == bet1.player ? bet1 : bet2;
        require(bet.moveHash == hash(move, secret));
        bet.move = move;

        LogReveal(msg.sender, uint256(move));
    }

    function bothMovesRevealed() public constant returns (bool movesRevealed) {
        return bet1.move != GameMove.VOID && bet2.move != GameMove.VOID;
    }

    function timeoutExpired() public constant returns (bool timedOut) {
        return (block.number > firstRevealBlock + gameTimeoutBlocks) && (bet1.move != GameMove.VOID || bet2.move != GameMove.VOID);
    }

    function isGameOver() public constant returns (bool gameOver) {
        return bothMovesRevealed() || timeoutExpired();
    }

    function chooseWinner() public returns (uint256 winnerIndex) {
        require(isGameOver());

        if (bet1.move != GameMove.VOID) {
            if (bet2.move != GameMove.VOID) {
                // Both moves revelead, apply the game winning rule.
                winnerId = rpsRules[uint256(bet1.move)][uint256(bet2.move)];
            }
            else {
                // Just move1 revelead and timeout expired, player1 wins.
                winnerId = 1;
            }
        }
        else {
            // Just move2 revelead and timeout expired, player2 wins.
            winnerId = 2;
        }

        // Reset the game moves.
        bet1.move = GameMove.VOID;
        bet2.move = GameMove.VOID;

        assert(this.balance == gamePrice * 2);

        if (winnerId == 1) {
            bet1.player.transfer(this.balance);
        }
        else if (winnerId == 2) {
            bet2.player.transfer(this.balance);
        }
        else {
            bet1.player.transfer(gamePrice);
            bet2.player.transfer(gamePrice);
        }

        // Reset the game.
        bet1.player = 0;
        bet1.moveHash = 0x0;
        bet2.player = 0;
        bet2.moveHash = 0x0;

        LogChooseWinner(msg.sender, winnerId);

        return winnerId;
    }

    function hash(GameMove move, bytes32 secret) public constant returns (bytes32 secretHash) {
        return keccak256(move, secret);
    }

    function () public payable {
        revert();
    }
}