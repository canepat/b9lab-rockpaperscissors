# b9lab-rockpaperscissors
RockPaperScissors Smart Contract - B9Lab Course Practice

### Overview: 
You will create a smart contract named RockPaperScissors whereby:
* Alice and Bob can play the classic rock paper scissors game
* to enrol, each player needs to deposit the right Ether amount
* to play, each player submits their unique move
* the contract decides and rewards the winner with all Ether

### Stretch goals:
* make it a utility whereby any 2 people can decide to play against each other
* reduce gas cost as much as you can
* make it a multi-game utility

### Implementation:
The following implementation choices has been made not explicitly required by spec:
* an agreement between players shall happen off-chain before game setup
* the first player starts a new game submitting also the game parameters and its hashed move
* the second player joins later the game submitting its own move
* the first player then reveals its move and the winner is...
* in case neither join nor reveal phase happened in time, any player can claim victory
* when the game has no winner the contract gives back the deposited Ether amount to each player

### Limitations:
The following limitations currently apply:
* no check for arithmetic overflow
* no web page
