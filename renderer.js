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
const { Jump, Size } = require('./jumpCommands')

const ForwardVelocity = 0x01
const BackwardVelocity = 0x7f

const sizeInBeats = 4
const stepSize = 0.25
const gridWidth = sizeInBeats / stepSize
const gridHeight = gridWidth

const cellLens = (row, col) => P(row, col, 'on')
const updateCellValue = (row, col, value, data) => L.set(cellLens(row, col), value, data)
const columnLens = col => P(L.sequence, col, 'on');
const turnOffAllInColumn = col => data => L.set(columnLens(col), false, data)

const toggleBus = new Bacon.Bus()

const midiInputSelected = new Bacon.Bus()
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
        width: 20,
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
  .map(ticks => Math.floor(ticks / (24 * stepSize)))
  .skipDuplicates()
  .map(steps => steps % (sizeInBeats/stepSize))

const table = R.times(row => R.times(col => ({ on: row === col }), gridWidth), gridHeight)

const updates = Bacon.mergeAll(toggleBus, inputMessages.filter(update => update.on && update.col >= 0 && update.col < gridWidth && update.row >= 0 && update.row < gridHeight));
const cellStateStream = updates.scan(table, (data, update) => updateCellValue(update.row, update.col, update.on, turnOffAllInColumn(update.col)(data)))

const playbackData = Bacon.combineTemplate({
  cellStates: cellStateStream,
  playbackPosition: playbackPositionStream
})

const currentPosition = cellStateStream.sampledBy(playbackPositionStream, (cellStates, playbackPosition) => {
  const cellsInColumn = L.collect(columnLens(playbackPosition), cellStates)
  return cellsInColumn.findIndex(R.identity)// + (playbackPosition === 0 ? gridWidth : 0)
})

const jumpCommands = currentPosition
  .slidingWindow(2)
  .map(([previous, next]) => next - previous - 1)
  .combine(playbackPositionStream, (diff, playback) => (diff + (playback === 0 ? gridWidth : 0)))
  .filter(R.complement(R.equals(NaN)))

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
  output.sendMessage(message)
}

const backwardButtonClicked = new Bacon.Bus()
const forwardButtonClicked = new Bacon.Bus()
const sizeButtonClicked = new Bacon.Bus()
const jumpButtonClicked = new Bacon.Bus()

const sizeToVelocity = size =>
  size == 8 ? 90 : size == 4 ? 80 : size == 2 ? 70 : size == 1 ? 60 : size == 0.5 ? 50 : 40

sizeButtonClicked.map(sizeToVelocity).onValue(velocity => {
  sendCommand(R.append(velocity, Size))
})

jumpButtonClicked.onValue(() => {
  sendCommand(R.append(0x01, Jump))
})

Bacon.mergeAll(
  jumpCommands,
  backwardButtonClicked.map(-1),
  forwardButtonClicked.map(1))
  .filter(active.toProperty())
  .map(a => a * stepSize)
  .onValue(messages => {
    const sendNextMessage = (jump) => {
      if (jump === 0) return
      const multiplier = jump > 0 ? 1 : -1
      const jumpCommand = R.append(jump > 0 ? ForwardVelocity : BackwardVelocity, Jump)
      const jumpSize = Math.abs(jump)
      const size = jumpSize >= 8 ? 8 : jumpSize >= 4 ? 4 : jumpSize >= 2 ? 2 : jumpSize >= 1 ? 1 : jumpSize >= 0.5 ? 0.5 : 0.25
      const velocity = sizeToVelocity(size)
      sendCommand(R.append(velocity, Size))
      sendCommand(jumpCommand)
      setTimeout(sendNextMessage, 10, jump - (size*multiplier))
    }

    sendNextMessage(messages)
  })

const Devices = React.createClass({
  render: function () {
    const sizeCallback = size => R.partial(this.props.sizeButtonCb, [size])

    return h.div({}, h.label({},
      'MIDI input device:',
      h.select({ onChange: e => this.props.selectionCb(parseInt(e.target.value)) },
        this.props.devices.map((device, index) => h.option({ key: `device-${index}`, value: index }, device)))
      ),
      h.button({ onClick: sizeCallback(1) }, 'Size'),
      h.button({ onClick: this.props.jumpButtonCb }, 'Jump'),
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
      jumpButtonCb: jumpButtonClicked.push.bind(jumpButtonClicked),
      sizeButtonCb: sizeButtonClicked.push.bind(sizeButtonClicked),
      active
    }),
    document.getElementById('devices')))
