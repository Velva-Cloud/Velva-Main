module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    'src/(.*)': '<rootDir>/src/$1',
  },
};