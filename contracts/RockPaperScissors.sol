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

    struct Game {
        uint256 price;
        uint256 startBlock;
        uint256 timeoutBlocks;
        address player1;
        bytes32 move1Hash;
        GameMove move1;
        address player2;
        GameMove move2;
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
        require(newGame.player1 == 0 && newGame.player2 == 0);

        newGame.price = _gamePrice;
        newGame.startBlock = block.number;
        newGame.timeoutBlocks = _gameTimeoutBlocks;
        newGame.player1 = msg.sender;
        newGame.move1Hash = _move1Hash;
        newGame.player2 = _player2;
        newGame.winnerId = 0;

        LogGameCreated(msg.sender, _player2, gameHash, _gamePrice, _gameTimeoutBlocks);
    }

    function joinGame(bytes32 _gameHash, uint8 _move2) public payable returns (bool joined) {
        require(_gameHash != 0);
        require(GameMove(_move2) != GameMove.VOID);
        require(!isGameOver(_gameHash));

        Game storage joinedGame = games[_gameHash];
        address player1 = joinedGame.player1;
        address player2 = joinedGame.player2;
        
        require(msg.value == joinedGame.price);
        require(player1 != 0 && player2 == msg.sender);
        require(joinedGame.move2 == GameMove.VOID);

        joinedGame.move2 = GameMove(_move2);

        LogGameJoined(player1, msg.sender, _gameHash, _move2);

        return true;
    }

    function revealGame(bytes32 _gameHash, uint8 _move1, bytes32 _secret1) public returns(uint256 winnerId) {
        require(_gameHash != 0);
        require(GameMove(_move1) != GameMove.VOID);
        require(!isGameOver(_gameHash));
        
        Game storage revealedGame = games[_gameHash];
        address player1 = revealedGame.player1;
        address player2 = revealedGame.player2;

        require(msg.sender == player1);
        require(revealedGame.move1 == GameMove.VOID && revealedGame.move2 != GameMove.VOID);
        require(revealedGame.move1Hash == hash(msg.sender, _move1, _secret1));

        revealedGame.move1 = GameMove(_move1);

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
        address player1 = claimedGame.player1;
        address player2 = claimedGame.player2;
        require(player1 != 0 && player2 != 0);

        winnerId = chooseWinner(claimedGame);
        assignReward(claimedGame, winnerId);
        reset(claimedGame, winnerId);

        LogGameClaimed(player1, player2, _gameHash, winnerId);

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
        return games[gameHash].player1;
    }

    function gameMoveHash1(bytes32 gameHash) public constant returns(bytes32 moveHash1) {
        return games[gameHash].move1Hash;
    }

    function gameMove1(bytes32 gameHash) public constant returns(GameMove move1) {
        return games[gameHash].move1;
    }

    function gamePlayer2(bytes32 gameHash) public constant returns(address player2) {
        return games[gameHash].player2;
    }

    function gameMove2(bytes32 gameHash) public constant returns(GameMove move2) {
        return games[gameHash].move2;
    }

    function hash(address sender, uint8 move, bytes32 secret) public constant returns(bytes32 secretHash) {
        return keccak256(sender, move, secret);
    }

    function bothMovesRevealed(bytes32 _gameHash) public constant returns(bool movesRevealed) {
        Game memory game = games[_gameHash];
        return game.move1 != GameMove.VOID && game.move2 != GameMove.VOID;
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

    function chooseWinner(Game revealedGame) private constant returns(uint256 winnerIndex) {
        GameMove move1 = revealedGame.move1;
        GameMove move2 = revealedGame.move2;
        if (move1 == move2) return 0;
        if (move1 == GameMove.VOID) return 2;
        if (move2 == GameMove.VOID) return 1;
        if (move1 == GameMove.ROCK && move2 == GameMove.SCISSORS) return 1;
        if (move1 == GameMove.SCISSORS && move2 == GameMove.ROCK) return 2;
        return (move1 > move2) ? 1 : 2;
    }

    function assignReward(Game revealedGame, uint256 winnerId) private {
        address player1 = revealedGame.player1;
        address player2 = revealedGame.player2;

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
        revealedGame.player1 = 0;
        revealedGame.move1Hash = 0x0;
        revealedGame.move1 = GameMove.VOID;
        revealedGame.player2 = 0;
        revealedGame.move2 = GameMove.VOID;
        revealedGame.winnerId = winnerId;
    }
}