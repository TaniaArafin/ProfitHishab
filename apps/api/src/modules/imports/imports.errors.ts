import { AppError } from '../../common/errors';

export class ImportError extends AppError {
  static unsupportedFile(): ImportError {
    return new ImportError(415, 'import_file_unsupported', 'This file type is not supported. Upload an .xlsx, .xls or .csv file.');
  }

  static fileTooLarge(): ImportError {
    return new ImportError(413, 'import_file_too_large', 'The file is larger than 5 MB.');
  }

  /** 422: the upload has no `file` part. */
  static fileMissing(): ImportError {
    const message = 'Choose a file to upload.';
    return new ImportError(422, 'validation_failed', message, { file: [message] });
  }

  /** 422: the mapping names columns the file does not have, one field error per target. */
  static columnsNotInFile(missing: Array<{ target: string; column: string }>): ImportError {
    const fields = Object.fromEntries(missing.map((m) => [`columns.${m.target}`, [`This file has no column "${m.column}".`]]));
    return new ImportError(422, 'validation_failed', `This file has no column "${missing[0].column}".`, fields);
  }

  static tooManyRows(max: number): ImportError {
    return new ImportError(422, 'import_too_many_rows', `The file has more than ${max} rows. Split it into smaller files.`);
  }

  static noHeader(): ImportError {
    return new ImportError(422, 'import_no_header', 'We could not find a header row in this file.');
  }

  static notFound(): ImportError {
    return new ImportError(404, 'import_not_found', 'Import not found.');
  }

  /** A step (preview, confirm) on an import that is not in the state that step needs. */
  static notReady(): ImportError {
    return new ImportError(409, 'import_not_ready', 'This import is not ready for that step.');
  }

  /** 409: orders matching this file's order IDs or rows were added after it was checked. */
  static stale(): ImportError {
    return new ImportError(409, 'import_stale', 'Some orders were added since you checked this file. Check it again.');
  }

  static cannotUndo(): ImportError {
    return new ImportError(409, 'import_cannot_undo', 'This import cannot be undone.');
  }
}
