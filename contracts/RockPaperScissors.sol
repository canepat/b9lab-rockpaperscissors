pragma solidity ^0.4.13;

contract RockPaperScissors {
    event LogGameCreated(
        address indexed player1,
        address indexed player2,
        bytes32 indexed gameHash,
        uint256 gamePrice,
        uint256 gameEndBlock
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
        uint256 endBlock;
        address player1;
        bytes32 move1Hash;
        GameMove move1;
        address player2;
        GameMove move2;
    }

    mapping(bytes32 => Game) private games;

    mapping(address => uint256) public balances;

    function gameHash(address _player2) public constant returns(bytes32 gameHash) {
        return keccak256(block.number, msg.sender, _player2);
    }

    function startGame(bytes32 _gameHash, bytes32 _move1Hash, address _player2, uint256 _gameTimeoutBlocks)
    public payable returns (bool started)
    {
        require(_gameHash != 0);
        require(_move1Hash != 0);
        require(_player2 != 0);
        require(_gameTimeoutBlocks != 0);
        require(msg.value != 0);

        Game storage newGame = games[_gameHash];
        require(newGame.player1 == 0 && newGame.player2 == 0);

        uint256 endBlock = block.number + _gameTimeoutBlocks;

        newGame.price = msg.value;
        newGame.endBlock = endBlock;
        newGame.player1 = msg.sender;
        newGame.move1Hash = _move1Hash;
        //newGame.move1 = GameMove.VOID; // already 0 either by default or by delete
        newGame.player2 = _player2;
        //newGame.move2 = GameMove.VOID; // already 0 either by default or by delete

        LogGameCreated(msg.sender, _player2, _gameHash, msg.value, endBlock);

        return true;
    }

    function joinGame(bytes32 _gameHash, uint8 _move2) public payable returns(bool joined) {
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
        reset(revealedGame);

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
        reset(claimedGame);

        LogGameClaimed(player1, player2, _gameHash, winnerId);

        return winnerId;
    }

    function game(bytes32 gameHash) public constant
    returns(uint256 price, uint256 endBlock, address player1, bytes32 move1Hash, GameMove move1, address player2, GameMove move2)
    {
        Game memory g = games[gameHash];
        return (g.price, g.endBlock, g.player1, g.move1Hash, g.move1, g.player2, g.move2);
    }

    function hash(address sender, uint8 move, bytes32 secret) public constant returns(bytes32 secretHash) {
        return keccak256(this, sender, move, secret);
    }

    function bothMovesRevealed(bytes32 _gameHash) public constant returns(bool movesRevealed) {
        Game memory game = games[_gameHash];
        return game.move1 != GameMove.VOID && game.move2 != GameMove.VOID;
    }

    function timeoutExpired(bytes32 _gameHash) public constant returns(bool timedOut) {
        return block.number > games[_gameHash].endBlock;
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

    function chooseWinner(Game storage revealedGame) private constant returns(uint256 winnerIndex) {
        GameMove move1 = revealedGame.move1;
        GameMove move2 = revealedGame.move2;
        if (move1 == move2) return 0;
        if (move1 == GameMove.VOID) return 2;
        if (move2 == GameMove.VOID) return 1;
        if (move1 == GameMove.ROCK && move2 == GameMove.SCISSORS) return 1;
        if (move1 == GameMove.SCISSORS && move2 == GameMove.ROCK) return 2;
        return (move1 > move2) ? 1 : 2;
    }

    function assignReward(Game storage revealedGame, uint256 winnerId) private {
        address player1 = revealedGame.player1;
        address player2 = revealedGame.player2;
        uint256 price = revealedGame.price;

        if (winnerId == 1) {
            balances[player1] += price * 2;
        }
        else if (winnerId == 2) {
            balances[player2] += price * 2;
        }
        else {
            if (player1 != 0) balances[player1] += price;
            if (player2 != 0) balances[player2] += price;
        }
    }

    function reset(Game storage selectedGame) private {
        selectedGame.player1 = 0;
        selectedGame.move1Hash = 0x0;
        selectedGame.move1 = GameMove.VOID;
        selectedGame.player2 = 0;
        selectedGame.move2 = GameMove.VOID;
    }
}