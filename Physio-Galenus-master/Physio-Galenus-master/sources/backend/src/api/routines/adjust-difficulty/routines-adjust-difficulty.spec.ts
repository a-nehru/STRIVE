import * as R from 'r-integration';

describe.skip('routines-adjust-difficulty testing', () => {
  it.skip('should not return any empty value', () => {
    const output = R.executeRScript(
      './src/api/routines/adjust-difficulty/exhaustive_testing.r',
    );
    console.log(output);
    expect(output).toEqual('success');
  });
});
