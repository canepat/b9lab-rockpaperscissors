pragma solidity ^0.4.13;

contract RockPaperScissors {
    event LogCreation(address indexed owner, uint256 indexed gamePrice, uint256 indexed gameTimeoutBlocks);
    event LogEnrol(address indexed caller, uint256 indexed betId);
    event LogPlay(address indexed caller, uint256 indexed betId);
    event LogReveal(address indexed caller, int256 indexed move);
    event LogChooseWinner(address indexed caller, uint256 indexed winnerId);

    enum GameMove {
        ROCK,
        PAPER,
        SCISSORS
    }

    struct GameBet {
        address player;
        bool played;
        bytes32 moveHash;
        int256 move;
    }

    int256 public constant INVALID_MOVE = -1;

    uint256 public gamePrice;
    uint256 public gameTimeoutBlocks;
    uint256 public firstRevealBlock;
    GameBet public bet1;
    GameBet public bet2;
    mapping (int256 => mapping (int256 => uint256)) rpsRules;

    function RockPaperScissors(uint256 _gamePrice, uint256 _gameTimeoutBlocks) {
        require(_gamePrice != 0);
        require(_gameTimeoutBlocks != 0);

        gamePrice = _gamePrice;
        gameTimeoutBlocks = _gameTimeoutBlocks;

        bet1.move = INVALID_MOVE;
        bet2.move = INVALID_MOVE;

        rpsRules[0][0] = 0; // R + R = -
        rpsRules[0][1] = 2; // R + P = 2
        rpsRules[0][2] = 1; // R + S = 1
        rpsRules[1][0] = 1; // P + R = 1
        rpsRules[1][1] = 0; // P + P = -
        rpsRules[1][2] = 2; // P + S = 2
        rpsRules[2][0] = 2; // S + R = 2
        rpsRules[2][1] = 1; // S + P = 1
        rpsRules[2][2] = 0; // S + S = -

        LogCreation(msg.sender, gamePrice, gameTimeoutBlocks);
    }
    
    function canEnrol() public constant returns (bool gameOpen) {
        return bet1.player == 0 || bet2.player == 0;
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
        return player == bet1.player && !bet1.played || player == bet2.player && !bet2.played;
    }

    function play(bytes32 moveHash) public {
        require(canPlay(msg.sender));

        GameBet storage bet = msg.sender == bet1.player ? bet1 : bet2;
        bet.moveHash = moveHash;
        bet.played = true;

        LogPlay(msg.sender, msg.sender == bet1.player ? 1 : 2);
    }

    function canReveal(address player) public constant returns (bool gameOpen) {
        return player == bet1.player || player == bet2.player && bet1.played && bet2.played;
    }

    function reveal(GameMove move, bytes32 secret) public {
        require(canReveal(msg.sender));

        if (bet1.move == INVALID_MOVE && bet2.move == INVALID_MOVE) {
            firstRevealBlock = block.number;
        }

        GameBet storage bet = msg.sender == bet1.player ? bet1 : bet2;
        require(bet.moveHash == hash(move, secret));
        bet.move = int256(move);

        LogReveal(msg.sender, int256(move));
    }

    function isGameOver() returns (bool gameOver) {
        // Both moves revealed OR reveal timeout in blocks expired.
        return bet1.move != INVALID_MOVE && bet2.move != INVALID_MOVE || block.number > firstRevealBlock + gameTimeoutBlocks;
    }

    function chooseWinner() public returns (uint256 winnerIndex) {
        require(isGameOver());

        uint256 winnerId;

        if (bet1.move != INVALID_MOVE) {
            if (bet2.move != INVALID_MOVE) {
                // Both moves revelead, apply the game winning rule.
                winnerId = rpsRules[bet1.move][bet2.move];
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
        bet1.move = INVALID_MOVE;
        bet2.move = INVALID_MOVE;

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
        bet1.played = false;
        bet2.player = 0;
        bet2.played = false;

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