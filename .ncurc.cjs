module.exports = {
  ...require('@thetigeregg/ncu-config'),
  reject: (name) => name === 'typescript',
};
