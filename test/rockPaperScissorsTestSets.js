"use strict";

const validTestSet = [
    { move1: 1, move2: 1, winner: 0 }, // R vs R = 0
    { move1: 1, move2: 2, winner: 2 }, // R vs P = 2
    { move1: 1, move2: 3, winner: 1 }, // R vs S = 1
    { move1: 2, move2: 1, winner: 1 }, // P vs R = 1
    { move1: 2, move2: 2, winner: 0 }, // P vs P = 0
    { move1: 2, move2: 3, winner: 2 }, // P vs S = 2
    { move1: 3, move2: 1, winner: 2 }, // S vs R = 2
    { move1: 3, move2: 2, winner: 1 }, // S vs P = 1
    { move1: 3, move2: 3, winner: 0 }, // S vs S = 0
]

const invalidTestSet = [
    { move1: -1, move2:  0 },
    { move1: -1, move2:  1 },
    { move1:  0, move2: -1 },
    { move1:  1, move2: -1 },
    { move1:  4, move2:  1 },
    { move1:  1, move2:  4 },
]

module.exports = {
    validTestSet: validTestSet,
    invalidTestSet: invalidTestSet,
};