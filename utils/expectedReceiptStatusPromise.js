"use strict";

/**
 * @param {!Function.<!Promise>} action.
 * @param {!number} expectedStatus. `1`: good tx, `0`: bad tx.
 * @param {!Number | !string | !BigNumber} gasToUse.
 * @returns {!Promise} which throws unless it hit a valid error.
 */
module.exports = function expectedReceiptStatusPromise(action, expectedStatus, gasToUse) {
    return new Promise(function (resolve, reject) {
            try {
                resolve(action());
            } catch(e) {
                reject(e);
            }
        })
        .then(function (txObj) {
            return typeof txObj === "string"
                ? web3.eth.getTransactionReceiptMined(txObj) // regular tx hash, get the Gist https://gist.github.com/xavierlepretre/88682e871f4ad07be4534ae560692ee6
                : typeof txObj.receipt !== "undefined"
                    ? txObj.receipt // truffle-contract function call
                    : typeof txObj.transactionHash === "string"
                        ? web3.eth.getTransactionReceiptMined(txObj.transactionHash) // deployment
                        : txObj; // Unknown last case
        })
        .then(
            function (receipt) {
                if (typeof receipt.status !== "undefined") {
                    // Byzantium
                    assert.equal(
                        receipt.status,
                        expectedStatus,
                        expectedStatus == 1 ? "should not have reverted" : "should have reverted");
                } else if (expectedStatus == 1) {
                    // Pre Byzantium
                    assert.isBelow(receipt.gasUsed, gasToUse, "should not have used all the gas");
                } else {
                    // Pre Byzantium
                    assert.equal(receipt.gasUsed, gasToUse, "should have used all the gas");
                }
            },
            function (e) {
                if (expectedStatus == 1) {
                    throw e;
                } else if ((e + "").indexOf("invalid JUMP") > -1 ||
                        (e + "").indexOf("out of gas") > -1 ||
                        (e + "").indexOf("invalid opcode") > -1 ||
                        (e + "").indexOf("revert") > -1) {
                    // We are in TestRPC
                } else if ((e + "").indexOf("please check your gas amount") > -1) {
                    // We are in Geth for a deployment
                } else {
                    throw e;
                }
            }
        );
    };