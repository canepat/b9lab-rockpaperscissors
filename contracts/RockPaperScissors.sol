pragma solidity ^0.4.13;

contract RockPaperScissors {
    event LogGameCreated(
        address indexed player1,
        address indexed player2,
        bytes32 indexed gameHash,
        uint256 gamePrice,
        uint256 gameTimeoutBlocks
    );
    event LogGameJoined(
        address indexed player1,
        address indexed player2,
        bytes32 indexed gameHash,
        uint8 move2
    );
    event LogGameRevealed(
        address indexed player1,
        address indexed player2,
        bytes32 indexed gameHash,
        uint8 move1,
        uint256 winnerId
    );
    event LogGameClaimed(
        address indexed player1,
        address indexed player2,
        bytes32 indexed gameHash,
        uint256 winnerId
    );    
    event LogWithdraw(address indexed player, uint256 indexed amount);

    enum GameMove { VOID, ROCK, PAPER, SCISSORS }

    struct GameBet {
        address player;
        bytes32 moveHash;
        GameMove move;
    }

    struct Game {
        uint256 price;
        uint256 startBlock;
        uint256 timeoutBlocks;
        GameBet bet1;
        GameBet bet2;
        uint256 winnerId;
    }

    mapping(bytes32 => Game) private games;

    mapping(address => uint256) public balances;

    function startGame(bytes32 _move1Hash, address _player2, uint256 _gamePrice, uint256 _gameTimeoutBlocks)
    public payable returns (bytes32 gameHash)
    {
        require(_move1Hash != 0);
        require(_player2 != 0);
        require(_gamePrice != 0);
        require(_gameTimeoutBlocks != 0);
        require(msg.value == _gamePrice);

        gameHash = keccak256(msg.sender, _player2);
        Game storage newGame = games[gameHash];
        require(newGame.bet1.player == 0 && newGame.bet2.player == 0);

        newGame.price = _gamePrice;
        newGame.startBlock = block.number;
        newGame.timeoutBlocks = _gameTimeoutBlocks;
        newGame.bet1.player = msg.sender;
        newGame.bet1.moveHash = _move1Hash;
        newGame.bet2.player = _player2;
        newGame.winnerId = 0;

        LogGameCreated(msg.sender, _player2, gameHash, _gamePrice, _gameTimeoutBlocks);
    }

    function joinGame(bytes32 _gameHash, uint8 _move2) public payable returns (bool joined) {
        require(_gameHash != 0);
        require(GameMove(_move2) != GameMove.VOID);
        require(!isGameOver(_gameHash));

        Game storage joinedGame = games[_gameHash];
        
        require(msg.value == joinedGame.price);
        require(joinedGame.bet1.player != 0 && joinedGame.bet2.player == msg.sender);
        require(joinedGame.bet2.move == GameMove.VOID);

        joinedGame.bet2.move = GameMove(_move2);

        LogGameJoined(joinedGame.bet1.player, msg.sender, _gameHash, _move2);

        return true;
    }

    function revealGame(bytes32 _gameHash, uint8 _move1, bytes32 _secret1) public returns(uint256 winnerId) {
        require(_gameHash != 0);
        require(GameMove(_move1) != GameMove.VOID);
        require(!isGameOver(_gameHash));
        
        Game storage revealedGame = games[_gameHash];
        address player1 = revealedGame.bet1.player;
        address player2 = revealedGame.bet2.player;

        require(msg.sender == player1);
        require(revealedGame.bet1.move == GameMove.VOID && revealedGame.bet2.move != GameMove.VOID);
        require(revealedGame.bet1.moveHash == hash(msg.sender, _move1, _secret1));

        revealedGame.bet1.move = GameMove(_move1);

        winnerId = chooseWinner(revealedGame);
        assignReward(revealedGame, winnerId);
        reset(revealedGame, winnerId);

        LogGameRevealed(player1, player2, _gameHash, _move1, winnerId);

        return winnerId;
    }

    function claimGame(bytes32 _gameHash) public returns(uint256 winnerId) {
        require(_gameHash != 0);
        require(timeoutExpired(_gameHash));
        
        Game storage claimedGame = games[_gameHash];

        winnerId = chooseWinner(claimedGame);
        assignReward(claimedGame, winnerId);
        reset(claimedGame, winnerId);

        LogGameClaimed(claimedGame.bet1.player, claimedGame.bet2.player, _gameHash, winnerId);

        return winnerId;
    }

    function gamePrice(bytes32 gameHash) public constant returns(uint256 price) {
        return games[gameHash].price;
    }

    function gameStartBlock(bytes32 gameHash) public constant returns(uint256 startBlock) {
        return games[gameHash].startBlock;
    }

    function gameTimeoutBlocks(bytes32 gameHash) public constant returns(uint256 timeoutBlocks) {
        return games[gameHash].timeoutBlocks;
    }

    function gamePlayer1(bytes32 gameHash) public constant returns(address player1) {
        return games[gameHash].bet1.player;
    }

    function gameMoveHash1(bytes32 gameHash) public constant returns(bytes32 moveHash1) {
        return games[gameHash].bet1.moveHash;
    }

    function gameMove1(bytes32 gameHash) public constant returns(GameMove move1) {
        return games[gameHash].bet1.move;
    }

    function gamePlayer2(bytes32 gameHash) public constant returns(address player2) {
        return games[gameHash].bet2.player;
    }

    function gameMoveHash2(bytes32 gameHash) public constant returns(bytes32 moveHash2) {
        return games[gameHash].bet2.moveHash;
    }

    function gameMove2(bytes32 gameHash) public constant returns(GameMove move2) {
        return games[gameHash].bet2.move;
    }

    function hash(address sender, uint8 move, bytes32 secret) public constant returns(bytes32 secretHash) {
        return keccak256(sender, move, secret);
    }

    function bothMovesRevealed(bytes32 _gameHash) public constant returns(bool movesRevealed) {
        Game memory game = games[_gameHash];
        return game.bet1.move != GameMove.VOID && game.bet2.move != GameMove.VOID;
    }

    function timeoutExpired(bytes32 _gameHash) public constant returns(bool timedOut) {
        Game memory game = games[_gameHash];
        return block.number > game.startBlock + game.timeoutBlocks;
    }

    function isGameOver(bytes32 _gameHash) public constant returns(bool gameOver) {
        return bothMovesRevealed(_gameHash) || timeoutExpired(_gameHash);
    }

    function withdraw() public {
        uint256 amount = balances[msg.sender];

        require(amount != 0);

        balances[msg.sender] = 0;
        
        LogWithdraw(msg.sender, amount);

        msg.sender.transfer(amount);
    }

    function () public payable {
        revert();
    }

    function chooseWinner(Game revealedGame) private constant returns(uint256 winnerIndex) {
        GameMove move1 = revealedGame.bet1.move;
        GameMove move2 = revealedGame.bet2.move;
        if (move1 == move2) return 0;
        if (move1 == GameMove.VOID) return 2;
        if (move2 == GameMove.VOID) return 1;
        if (move1 == GameMove.ROCK && move2 == GameMove.SCISSORS) return 1;
        if (move1 == GameMove.SCISSORS && move2 == GameMove.ROCK) return 2;
        return (move1 > move2) ? 1 : 2;
    }

    function assignReward(Game revealedGame, uint256 winnerId) private {
        address player1 = revealedGame.bet1.player;
        address player2 = revealedGame.bet2.player;

        if (winnerId == 1) {
            balances[player1] += revealedGame.price * 2;
        }
        else if (winnerId == 2) {
            balances[player2] += revealedGame.price * 2;
        }
        else {
            if (player1 != 0) balances[player1] += revealedGame.price;
            if (player2 != 0) balances[player2] += revealedGame.price;
        }
    }

    function reset(Game storage revealedGame, uint256 winnerId) private {
        revealedGame.price = 0;
        revealedGame.startBlock = 0;
        revealedGame.timeoutBlocks = 0;
        revealedGame.bet1.player = 0;
        revealedGame.bet1.moveHash = 0x0;
        revealedGame.bet1.move = GameMove.VOID;
        revealedGame.bet2.player = 0;
        revealedGame.bet2.moveHash = 0x0;
        revealedGame.bet2.move = GameMove.VOID;
        revealedGame.winnerId = winnerId;
    }
}