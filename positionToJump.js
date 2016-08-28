"use strict"; // eslint-disable-line semi

const R = require('ramda')

const arrayWith = (value, length) => R.times(() => value, length)
const intersperseValueAfterItems = (value, list) => R.pipe(R.zip, R.flatten)(arrayWith(value, list.length), list)

const positionsToJumps = positions =>
  R.pipe(
    R.append(8),
    R.reduce((jumps, position) =>
      R.append(position - R.sum(intersperseValueAfterItems(1, jumps)), jumps), [])
  )(positions)

module.exports = positionsToJumps

if (require.main === module) {
  const positions = [0, 3, 2, 3, 4, 5, 6, 7]
  console.log(positionsToJumps(positions))
}
