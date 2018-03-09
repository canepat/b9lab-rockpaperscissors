pragma solidity ^0.4.13;

contract RockPaperScissors {
    event LogCreation(address indexed owner, uint256 indexed gamePrice, uint256 indexed gameTimeoutBlocks);
    event LogEnrol(address indexed caller, uint256 indexed betId);
    event LogPlay(address indexed caller, uint256 indexed betId);
    event LogReveal(address indexed caller, uint256 indexed move);
    event LogChooseWinner(address indexed caller, uint256 indexed winnerId);
    event LogWithdraw(address indexed player, uint256 indexed amount);

    enum GameMove { VOID, ROCK, PAPER, SCISSORS }

    struct GameBet {
        address player;
        bytes32 moveHash;
        GameMove move;
    }

    uint256 public gamePrice;
    uint256 public winnerReward;
    uint256 public gameTimeoutBlocks;
    uint256 public firstRevealBlock;
    GameBet public bet1;
    GameBet public bet2;
    uint256 public winnerId;
    mapping(address => uint256) public balances;

    function RockPaperScissors(uint256 _gamePrice, uint256 _gameTimeoutBlocks) {
        require(_gamePrice != 0);
        require(_gameTimeoutBlocks != 0);

        gamePrice = _gamePrice;
        winnerReward = _gamePrice * 2;
        gameTimeoutBlocks = _gameTimeoutBlocks;

        bet1.move = GameMove.VOID;
        bet2.move = GameMove.VOID;

        LogCreation(msg.sender, _gamePrice, _gameTimeoutBlocks);
    }
    
    function canEnrol() public constant returns(bool gameOpen) {
        return (bet1.player == 0 && bet2.player != msg.sender) || (bet1.player != msg.sender && bet2.player == 0);
    }

    function enrol() public payable {
        require(canEnrol());
        require(msg.value == gamePrice);

        uint256 betId;
        if (bet1.player == 0) {
            bet1.player = msg.sender;
            betId = 1;
        }
        else {
            bet2.player = msg.sender;
            betId = 2;
        }

        LogEnrol(msg.sender, betId);
    }

    function canPlay(address player) public constant returns(bool gamePlayable) {
        return (player == bet1.player && bet1.moveHash == 0x0) || (player == bet2.player && bet2.moveHash == 0x0);
    }

    function play(bytes32 moveHash) public {
        require(canPlay(msg.sender));
        require(moveHash != 0);

        bool isPlayer1 = msg.sender == bet1.player;

        GameBet storage bet = isPlayer1 ? bet1 : bet2;
        bet.moveHash = moveHash;

        LogPlay(msg.sender, isPlayer1 ? 1 : 2);
    }

    function canReveal(address player) public constant returns(bool gameOpen) {
        return (player == bet1.player) || (player == bet2.player && bet1.moveHash != 0x0 && bet2.moveHash != 0x0);
    }

    function reveal(uint8 move, bytes32 secret) public {
        require(canReveal(msg.sender));
        require(GameMove(move) != GameMove.VOID);

        if (bet1.move == GameMove.VOID && bet2.move == GameMove.VOID) {
            firstRevealBlock = block.number;
        }

        GameBet storage bet = msg.sender == bet1.player ? bet1 : bet2;
        require(bet.moveHash == hash(msg.sender, move, secret));
        bet.move = GameMove(move);

        LogReveal(msg.sender, move);
    }

    function bothMovesRevealed() public constant returns(bool movesRevealed) {
        return bet1.move != GameMove.VOID && bet2.move != GameMove.VOID;
    }

    function timeoutExpired() public constant returns(bool timedOut) {
        return (block.number > firstRevealBlock + gameTimeoutBlocks) && (bet1.move != GameMove.VOID || bet2.move != GameMove.VOID);
    }

    function isGameOver() public constant returns(bool gameOver) {
        return bothMovesRevealed() || timeoutExpired();
    }

    function chooseWinner() public returns(uint256 winnerIndex) {
        require(isGameOver());

        winnerId = outcome(bet1.move, bet2.move);

        // Reset the game moves.
        bet1.move = GameMove.VOID;
        bet2.move = GameMove.VOID;

        if (winnerId == 1) {
            balances[bet1.player] += winnerReward;
        }
        else if (winnerId == 2) {
            balances[bet2.player] += winnerReward;
        }
        else {
            balances[bet1.player] += gamePrice;
            balances[bet2.player] += gamePrice;
        }

        // Reset the game.
        bet1.player = 0;
        bet1.moveHash = 0x0;
        bet2.player = 0;
        bet2.moveHash = 0x0;

        LogChooseWinner(msg.sender, winnerId);

        return winnerId;
    }

    function withdraw() public {
        uint256 amount = balances[msg.sender];

        require(amount != 0);

        balances[msg.sender] = 0;
        
        msg.sender.transfer(amount);

        LogWithdraw(msg.sender, amount);   
    }

    function hash(address sender, uint8 move, bytes32 secret) public constant returns(bytes32 secretHash) {
        return keccak256(sender, move, secret);
    }

    function outcome(GameMove move1, GameMove move2) public constant returns(uint256 winnerIndex) {
        if (move1 == move2) return 0;
        if (move1 == GameMove.VOID) return 2;
        if (move2 == GameMove.VOID) return 1;
        if (move1 == GameMove.ROCK && move2 == GameMove.SCISSORS) return 1;
        if (move1 == GameMove.SCISSORS && move2 == GameMove.ROCK) return 2;
        return (move1 > move2) ? 1 : 2;
    }

    function () public payable {
        revert();
    }
}