const React = require('react')
const ReactDOM = require('react-dom')
const R = require('ramda')
const Bacon = require('baconjs')
const h = React.DOM
const L = require('partial.lenses')
const P = L.default
const midi = require('midi');

const cellLens = (row, col) => P(row, col, 'on')
const updateCellValue = (row, col, value, data) => L.set(cellLens(row, col), value, data)
const columnLens = col => P(L.sequence, col, 'on');
const turnOffAllInColumn = col => data => L.set(columnLens(col), false, data)

const toggleBus = new Bacon.Bus()

// Set up a new input.
const input = new midi.input()
const output = new midi.output()
output.openVirtualPort('VirtualPad')

const isControlMessage = message => message[0] >> 4 === 0xb

const inputMessages = Bacon.fromEventTarget(input, 'message', R.nthArg(1))
    .map(([channel, pitch, velocity]) => ({
      row: channel - 144,
      col: pitch - 41,
      on: velocity !== 0
    }))

input.openVirtualPort('VirtualPad')

const Cell = React.createClass({
  render: function () {
    return h.td({
      style: {
        width: 40, //`${Math.floor(100 / this.props.row.length)}%`,
        height: 40,
        backgroundColor: this.props.cell.on ? 'yellow' : 'gray',
        opacity: this.props.highlight ? 1 : 0.7
      },
      onClick: () => toggleBus.push({row: this.props.rowIndex, col: this.props.cellIndex, on: !this.props.cell.on})
    }, '')
  }
})

const playbackPositionStream = Bacon.interval(1000).scan(0, i => ++i).map(i => i % 8)

const table = R.times(row => R.times(col => ({on: row === col}), 8), 8)

const updates = Bacon.mergeAll(toggleBus, inputMessages);
const cellStateStream = updates.scan(table, (data, update) => updateCellValue(update.row, update.col, update.on, turnOffAllInColumn(update.col)(data)))

const playbackData = Bacon.combineTemplate({
  cellStates: cellStateStream,
  playbackPosition: playbackPositionStream
})

playbackData.onValue(({cellStates, playbackPosition}) => {
  const cellsInColumn = L.collect(columnLens(playbackPosition), cellStates)
  const row = cellsInColumn.findIndex(R.identity)
  console.log('row', row)
  output.sendMessage([row, 0, 127])
})

playbackData.onValue(({cellStates, playbackPosition}) =>
    ReactDOM.render(
        h.table({},
            h.tbody({},
                cellStates.map((row, rowIndex) => h.tr({
                      key: `row-${rowIndex}`
                    },
                    row.map((cell, cellIndex) => React.createElement(Cell, {
                      cell: cell,
                      cellIndex: cellIndex,
                      row: row,
                      rowIndex: rowIndex,
                      key: `cell-${cellIndex}`,
                      highlight: cellIndex === playbackPosition
                    })))))),
        document.getElementById('content')))
