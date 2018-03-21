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

### Implementation:
The following implementation choices has been made not explicitly required by spec:
* when the game has no winner the contract gives back the deposited Ether amount to each player

### Limitations:
The following limitations currently apply:
* no check for arithmetic overflow
* no web page
