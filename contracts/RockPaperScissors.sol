pragma solidity ^0.4.13;

contract RockPaperScissors {
    event LogCreation(address indexed owner, uint256 indexed gamePrice, uint256 indexed gameTimeoutBlocks);
    event LogEnrol(address indexed caller, uint256 indexed betId);
    event LogPlay(address indexed caller, uint256 indexed betId, bytes32 indexed moveHash);
    event LogReveal(address indexed caller, uint256 indexed betId, uint256 indexed move);
    event LogChooseWinner(address indexed caller, uint256 indexed winnerId);
    event LogWithdraw(address indexed player, uint256 indexed amount);

    enum GameMove { VOID, ROCK, PAPER, SCISSORS }

    struct GameBet {
        address player;
        bytes32 moveHash;
        GameMove move;
    }
    
    uint256 public gamePrice;
    uint256 public gameStartBlock;
    uint256 public gameTimeoutBlocks;
    GameBet public bet1;
    GameBet public bet2;
    uint256 public winnerId;
    mapping(address => uint256) public balances;

    function RockPaperScissors(uint256 _gamePrice, uint256 _gameTimeoutBlocks) {
        require(_gamePrice != 0);
        require(_gameTimeoutBlocks != 0);

        gamePrice = _gamePrice;
        gameTimeoutBlocks = _gameTimeoutBlocks;

        LogCreation(msg.sender, _gamePrice, _gameTimeoutBlocks);
    }

    function canEnrolAs() public constant returns(uint256 betId) {
        return (bet1.player == 0 && bet2.player != msg.sender) ? 1
            : (bet1.player != msg.sender && bet2.player == 0) ? 2
            : 0;
    }

    function enrol() public payable returns(uint256 betId) {
        require(msg.value == gamePrice);
        
        betId = canEnrolAs();

        require(betId != 0);

        if (bet1.player == 0 && bet2.player == 0) {
            gameStartBlock = block.number;
        }

        GameBet storage bet = betId == 1 ? bet1 : bet2;
        bet.player = msg.sender;

        LogEnrol(msg.sender, betId);
    }

    function canPlayAs(address player) public constant returns(uint256 betId) {
        return (player == bet1.player && bet1.moveHash == 0x0) ? 1
            : (player == bet2.player && bet2.moveHash == 0x0) ? 2
            : 0;
    }

    function play(bytes32 moveHash) public returns(uint256 betId) {
        require(moveHash != 0);

        betId = canPlayAs(msg.sender);

        require(betId != 0);

        GameBet storage bet = betId == 1 ? bet1 : bet2;
        bet.moveHash = moveHash;

        LogPlay(msg.sender, betId, moveHash);
    }

    function canRevealAs(address player) public constant returns(uint256 betId) {
        return (player == bet1.player && bet1.moveHash != 0x0) ? 1
            : (player == bet2.player && bet2.moveHash != 0x0) ? 2
            : 0;
    }

    function reveal(uint8 move, bytes32 secret) public returns(uint256 betId) {
        require(GameMove(move) != GameMove.VOID);

        betId = canRevealAs(msg.sender);

        require(betId != 0);

        GameBet storage bet = betId == 1 ? bet1 : bet2;
        require(bet.moveHash == hash(msg.sender, move, secret));
        bet.move = GameMove(move);

        LogReveal(msg.sender, betId, move);
    }

    function bothMovesRevealed() public constant returns(bool movesRevealed) {
        return bet1.move != GameMove.VOID && bet2.move != GameMove.VOID;
    }

    function timeoutExpired() public constant returns(bool timedOut) {
        return block.number > gameStartBlock + gameTimeoutBlocks;
    }

    function isGameOver() public constant returns(bool gameOver) {
        return bothMovesRevealed() || timeoutExpired();
    }

    function chooseWinner() public returns(uint256 winnerIndex) {
        require(isGameOver());

        winnerId = outcome(bet1.move, bet2.move);

        if (winnerId == 1) {
            balances[bet1.player] += gamePrice * 2;
        }
        else if (winnerId == 2) {
            balances[bet2.player] += gamePrice * 2;
        }
        else {
            if (bet1.player != 0) balances[bet1.player] += gamePrice;
            if (bet2.player != 0) balances[bet2.player] += gamePrice;
        }

        // Reset the game.
        gameStartBlock = 0;
        bet1.player = 0;
        bet1.moveHash = 0x0;
        bet1.move = GameMove.VOID;
        bet2.player = 0;
        bet2.moveHash = 0x0;
        bet2.move = GameMove.VOID;

        LogChooseWinner(msg.sender, winnerId);

        return winnerId;
    }

    function withdraw() public {
        uint256 amount = balances[msg.sender];

        require(amount != 0);

        balances[msg.sender] = 0;
        
        LogWithdraw(msg.sender, amount);

        msg.sender.transfer(amount);
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