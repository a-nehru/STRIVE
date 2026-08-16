export const generateToken = (tokenLength: number): string => {
  let result = '';
  const characters = 'CDEHKMPRTUWXY012458';
  for (let i = 0; i < tokenLength; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};
