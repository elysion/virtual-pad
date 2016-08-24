# Virtual LaunchPad MIDI controller

Simple proof-of-concept for implementing mappable beat masher effect for Traktor.

In order to get the app running, you need to make sure node-midi and electron are using the same version of node
bindings:

```
$ export npm_config_disturl=https://atom.io/download/atom-shell
$ export npm_config_target=0.37.8
$ export npm_config_arch=x64
$ HOME=~/.electron-gyp npm install midi
```

To start the application run ```npm start```

# electron-quick-start

**Clone and run for a quick way to see an Electron in action.**

This is a minimal Electron application based on the [Quick Start Guide](http://electron.atom.io/docs/latest/tutorial/quick-start) within the Electron documentation.

A basic Electron application needs just these files:

- `package.json` - Points to the app's main file and lists its details and dependencies.
- `main.js` - Starts the app and creates a browser window to render HTML. This is the app's **main process**.
- `index.html` - A web page to render. This is the app's **renderer process**.

You can learn more about each of these components within the [Quick Start Guide](http://electron.atom.io/docs/latest/tutorial/quick-start).

## To Use

To clone and run this repository you'll need [Git](https://git-scm.com) and [Node.js](https://nodejs.org/en/download/) (which comes with [npm](http://npmjs.com)) installed on your computer. From your command line:

```bash
# Clone this repository
git clone https://github.com/electron/electron-quick-start
# Go into the repository
cd electron-quick-start
# Install dependencies and run the app
npm install && npm start
```

Learn more about Electron and its API in the [documentation](http://electron.atom.io/docs/latest).

#### License [CC0 (Public Domain)](LICENSE.md)
