const React = require('react')
const ReactDOM = require('react-dom')
const R = require('ramda')
const Bacon = require('baconjs')
const h = React.DOM
const L = require('partial.lenses')
const P = L.default
const midi = require('midi');
const midiHelpers = require('./lib/midiHelpers')
const { ClockTick, ClockStart } = require('./lib/midiMessages')
const { SkipForwardCommand, SkipBackwardCommand } = require('./jumpCommands')

const gridWidth = 16
const gridHeight = gridWidth

const cellLens = (row, col) => P(row, col, 'on')
const updateCellValue = (row, col, value, data) => L.set(cellLens(row, col), value, data)
const columnLens = col => P(L.sequence, col, 'on');
const turnOffAllInColumn = col => data => L.set(columnLens(col), false, data)

const toggleBus = new Bacon.Bus()

const midiInputSelected = new Bacon.Bus()
midiInputSelected.log('value')
// Set up a new clockInput.
const clockInput = new midi.input()
clockInput.ignoreTypes(false, false, false)

const activeBus = new Bacon.Bus()

var pureMessages = midiInputSelected.flatMap(portNumber => {
  const messageInput = new midi.input()
  messageInput.openPort(portNumber)
  return Bacon.fromEventTarget(messageInput, 'message', R.nthArg(1))
})

const active = Bacon.mergeAll(
  activeBus,
  pureMessages.filter(R.equals([154, 60, 127])).scan(false, R.not)
)

const inputMessages = pureMessages
  .map(([channel, pitch, velocity]) => ({
    row: channel - 144,
    col: pitch - 41,
    on: velocity !== 0
  }))

const output = new midi.output()
output.openVirtualPort('VirtualPad')

const isControlMessage = message => message[0] >> 4 === 0xb
const isTickOrStart = R.flip(R.contains)([ClockTick, ClockStart])

const clock = Bacon.fromEventTarget(clockInput, 'message', R.pipe(R.nthArg(1), R.head)).filter(isTickOrStart)
clockInput.openVirtualPort('VirtualPad')

const Cell = React.createClass({
  render: function () {
    return h.td({
      style: {
        width: 20, //`${Math.floor(100 / this.props.row.length)}%`,
        height: 20,
        backgroundColor: this.props.cell.on ? 'yellow' : 'gray',
        opacity: this.props.highlight ? 1 : 0.7
      },
      onClick: () => toggleBus.push({ row: this.props.rowIndex, col: this.props.cellIndex, on: !this.props.cell.on })
    }, '')
  }
})

const playbackPositionStream = clock
  .scan(0, (ticks, tick) => tick === ClockStart ? 0 : ticks + 1)
  .map(ticks => Math.floor(ticks / (24 / 2)))
  .skipDuplicates()
  .map(beats => beats % gridWidth)//Bacon.interval(1000).scan(0, i => ++i).map(i => i % 8)

const table = R.times(row => R.times(col => ({ on: row === col }), gridWidth), gridHeight)

const updates = Bacon.mergeAll(toggleBus, inputMessages.filter(update => update.on && update.col >= 0 && update.col < gridWidth && update.row >= 0 && update.row < gridHeight));
const cellStateStream = updates.scan(table, (data, update) => updateCellValue(update.row, update.col, update.on, turnOffAllInColumn(update.col)(data)))

const playbackData = Bacon.combineTemplate({
  cellStates: cellStateStream,
  playbackPosition: playbackPositionStream
})

const currentPosition = cellStateStream.sampledBy(playbackPositionStream, (cellStates, playbackPosition) => {
  const cellsInColumn = L.collect(columnLens(playbackPosition), cellStates)
  return cellsInColumn.findIndex(R.identity)
})

const jumpCommands = currentPosition
  .slidingWindow(2)
  .filter(playbackPositionStream.map(R.complement(R.equals(0))))
  .map(([previous, next]) => next - previous - 1)
  .filter(R.complement(R.equals(NaN)))
  .map(value => R.times(() => value > 0 ? SkipForwardCommand : SkipBackwardCommand, Math.abs(value)))

const PadGrid = React.createClass({
  render: function () {
    const that = this
    return h.table({},
      h.tbody({},
        that.props.cellStates.map((row, rowIndex) => h.tr({
            key: `row-${rowIndex}`
          },
          row.map((cell, cellIndex) => React.createElement(Cell, {
            cell: cell,
            cellIndex: cellIndex,
            row: row,
            rowIndex: rowIndex,
            key: `cell-${cellIndex}`,
            highlight: cellIndex === that.props.playbackPosition
          }))))))
  }
})

playbackData.onValue(({ cellStates, playbackPosition }) =>
  ReactDOM.render(React.createElement(PadGrid, { cellStates, playbackPosition }),
    document.getElementById('content')))

const sendCommand = message => {
  // console.log('sending', message)
  output.sendMessage(message)
}

const backwardButtonClicked = new Bacon.Bus()
const forwardButtonClicked = new Bacon.Bus()

Bacon.mergeAll(
  jumpCommands,
  backwardButtonClicked.map([SkipBackwardCommand]),
  forwardButtonClicked.map([SkipForwardCommand]))
  .map(R.chain(R.identity))
  .map(value => value > 1 ? value + 1 : value)
  .delay(5)
  .filter(active.toProperty())
  .onValue(messages => {
    const sendNextMessage = (nextMessages) => {
      if (nextMessages.length === 0) return
      sendCommand(R.head(nextMessages))
      setTimeout(sendNextMessage, 5, R.tail(nextMessages))
    }
    sendNextMessage(messages)
  })

const Devices = React.createClass({
  render: function () {
    return h.div({}, h.label({},
      'MIDI input device:',
      h.select({ onChange: e => this.props.selectionCb(parseInt(e.target.value)) },
        this.props.devices.map((device, index) => h.option({ key: `device-${index}`, value: index }, device)))
      ),
      h.button({ onClick: this.props.backwardButtonCb }, 'Back'),
      h.button({ onClick: this.props.forwardButtonCb }, 'Forward'),
      h.label({}, 'Active:', h.input({
        onClick: e => this.props.activeCb(e.target.checked),
        type: 'checkbox',
        checked: this.props.active
      })))
  }
})

active.toProperty(false).onValue(active =>
  ReactDOM.render(React.createElement(Devices, {
      devices: midiHelpers.listMidiInputPorts(),
      selectionCb: midiInputSelected.push.bind(midiInputSelected),
      activeCb: activeBus.push.bind(activeBus),
      backwardButtonCb: backwardButtonClicked.push.bind(backwardButtonClicked),
      forwardButtonCb: forwardButtonClicked.push.bind(forwardButtonClicked),
      active
    }),
    document.getElementById('devices')))
