const midi = require('midi')

const listMidiInputPorts = () => {
  const input = new midi.input()

  var inputs = []
  for (var i = 0; i < input.getPortCount(); i++) {
    inputs.push(input.getPortName(i))
  }

  input.closePort()
  return inputs
}

const getPortNumber = name => {
  var midiInputPorts = listMidiInputPorts()
  Console.log(midiInputPorts, name, midiInputPorts.indexOf(name))
  if (midiInputPorts.indexOf(name) == -1) {
    throw `Port ${name} not found! Available ports: ${midiInputPorts.join(', ')}`
  }
  return midiInputPorts.indexOf(name)
}

module.exports = {
  listMidiInputPorts,
  getPortNumber
}
