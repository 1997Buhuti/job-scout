/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/_tests/**/*.test.ts', '**/*.test.ts'],
  moduleNameMapper: {
    '^@functions/(.*)$': '<rootDir>/src/functions/$1',
    '^@libs/(.*)$': '<rootDir>/src/libs/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@data/(.*)$': '<rootDir>/src/data/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@testHelpers/(.*)$': '<rootDir>/testHelpers/$1',
    '^@util/(.*)$': '<rootDir>/src/common/util/$1',
  },
  clearMocks: true,
};
