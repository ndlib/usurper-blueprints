# Contributing

## Getting Started
Requires Node.js >= 10.3.0
```shell
git clone https://github.com/ndlib/usurper-blueprints.git
cd usurper-blueprints
npm install
```

## Building and Testing
```shell
npm run build
npm test
```

Can also watch for changes and do both build and tests with the watch script (*Note: currently only works for changes to src*)
```shell
npm run watch
```

## Pull Requests
Before submitting a PR, make sure to run all of the following:
```shell
yarn build
yarn test
yarn lint
yarn format
```
