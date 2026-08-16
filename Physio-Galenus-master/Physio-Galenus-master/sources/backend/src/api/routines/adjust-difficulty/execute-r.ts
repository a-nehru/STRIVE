/* eslint-disable @typescript-eslint/no-var-requires */
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
// Based on https://www.npmjs.com/package/r-integration

const R_BINARY_PATH = '/usr/bin/Rscript';

/**
 * calls a R function located in an external script with parameters and returns the result
 *
 * @param {string} fileLocation where the file containing the function is stored
 * @param {string} methodName the name of the method to execute
 * @param {Object} parameters an object containing a binding between parameter names and value to pass to the function or an array
 * @returns {string} the execution output of the function
 */
export const callMethod = async (
  fileLocation: string,
  methodName: string,
  parameters: any,
) => {
  let methodSyntax = `${methodName}(`;

  // check if params is an array of parameters or an object
  if (Array.isArray(parameters)) {
    methodSyntax += convertParamsArray(parameters);
  } else {
    for (const [key, value] of Object.entries(parameters)) {
      if (Array.isArray(value)) {
        methodSyntax += `${key}=${convertParamsArray(value)}`;
      } else if (typeof value == 'string') {
        methodSyntax += `${key}='${value}',`;
      } else if (value == undefined) {
        methodSyntax += `${key}=NA,`;
      } else {
        methodSyntax += `${key}=${value},`;
      }
    }
  }

  methodSyntax = methodSyntax.slice(0, -1);
  methodSyntax += ')';

  return await executeRCommand(
    `source('${fileLocation}') ; print(${methodSyntax})`,
  );
};

/**
 * Formats the parameters so R could read them
 */
const convertParamsArray = (params) => {
  let methodSyntax = ``;

  if (Array.isArray(params)) {
    methodSyntax += 'c(';

    for (let i = 0; i < params.length; i++) {
      methodSyntax += convertParamsArray(params[i]);
    }

    methodSyntax = methodSyntax.slice(0, -1);
    methodSyntax += '),';
  } else if (typeof params == 'string') {
    methodSyntax += `'${params}',`;
  } else if (params == undefined) {
    methodSyntax += `NA,`;
  } else {
    methodSyntax += `${params},`;
  }

  return methodSyntax;
};

/**
 * Execute in R a specific one line command
 *
 * @param {string} command the single line R command
 * @returns {String[]} an array containing all the results from the command execution output
 */
export const executeRCommand = async (command) => {
  let output = null;

  const commandResult = await execFile(R_BINARY_PATH, ['-e', command]);

  if (commandResult.stdout) {
    output = commandResult.stdout;
    output = filterMultiline(output);
  } else {
    throw Error(`[R: compile error] ${commandResult.stderr}`);
  }

  return output;
};

/**
 * filters the multiline output from the executeRcommand and executeRScript functions
 * using regular expressions
 *
 * @param {string} commandResult the multiline result of RScript execution
 * @returns {String[]} an array containing all the results
 */
const filterMultiline = (commandResult) => {
  let data;

  // remove last newline to avoid empty results
  commandResult = commandResult.replace(/\[\d+\] /g, '');
  commandResult = commandResult.replace(/\t*\s*\n*$/g, '');
  commandResult = commandResult.replace(/[\s\t]+/g, '\n');

  // check if data is JSON parsable
  try {
    data = [JSON.parse(commandResult)];
  } catch (e) {
    // the result is not json parsable -> split
    data = commandResult.split(/[\n]+/);

    // find undefined or NaN and remove quotes
    for (let i = 0; i < data.length; i++) {
      if (data[i] == 'NA') {
        data[i] = undefined;
      } else if (data[i] == 'NaN') {
        data[i] = NaN;
      } else {
        data[i] = data[i].replace(/\"/g, '');
      }
    }
  }

  return data;
};
