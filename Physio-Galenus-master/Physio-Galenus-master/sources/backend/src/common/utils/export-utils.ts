import * as xlsx from 'xlsx';

export enum EExportType {
  CSV = 'csv',
}

/**
 * Exports data to some known format, ie. csv, xlsx, etc.
 * @param exportType csv or xlsx
 * @param data an array of objects
 */
export const exportTo = (exportType: EExportType, data: any[]): any => {
  const writeCSV = (): any => {
    const sheet: xlsx.WorkSheet = xlsx.utils.json_to_sheet(data);
    return xlsx.utils.sheet_to_csv(sheet);
  };

  switch (exportType) {
    case EExportType.CSV:
      return writeCSV();
    default:
      return null;
  }
};
