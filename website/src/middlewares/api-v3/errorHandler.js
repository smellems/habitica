// The error handler middleware that handles all errors
// and respond to the client
import logger from '../../libs/api-v3/logger';
import {
  CustomError,
  BadRequest,
  InternalServerError,
} from '../../libs/api-v3/errors';
import { map } from 'lodash';

export default function errorHandler (err, req, res, next) { // eslint-disable-line no-unused-vars
  // Log the original error with some metadata
  let stack = err.stack || err.message || err;

  logger.error(stack, {
    originalUrl: req.originalUrl,
    headers: req.headers,
    body: req.body,
    fullError: err,
  });

  // In case of a CustomError class, use it's data
  // Otherwise try to identify the type of error (mongoose validation, mongodb unique, ...)
  // If we can't identify it, respond with a generic 500 error
  let responseErr = err instanceof CustomError ? err : null;

  // Handle errors created with 'http-errors' or similar that have a status/statusCode property
  if (err.statusCode && typeof err.statusCode === 'number') {
    responseErr = new CustomError();
    responseErr.httpCode = err.statusCode;
    responseErr.error = err.name;
    responseErr.message = err.message;
  }

  // TODO make mongoose and express-validator errors more recognizable

  // Handle errors by express-validator
  if (Array.isArray(err) && err[0].param && err[0].msg) {
    responseErr = new BadRequest(res.t('invalidReqParams'));
    responseErr.errors = err.map((paramErr) => {
      return {
        message: paramErr.msg,
        param: paramErr.param,
        value: paramErr.value,
      };
    });
  }

  // Handle mongoose validation errors
  if (err.name === 'ValidationError') {
    responseErr = new BadRequest(err.message); // TODO standard message? translate?
    responseErr.errors = map(err.errors, (mongooseErr) => {
      return {
        message: mongooseErr.message,
        path: mongooseErr.path,
        value: mongooseErr.value,
      };
    });
  }

  if (!responseErr || responseErr.httpCode >= 500) {
    // Try to identify the error...
    // ...
    // Otherwise create an InternalServerError and use it
    // we don't want to leak anything, just a generic error message
    // Use it also in case of identified errors but with httpCode === 500
    responseErr = new InternalServerError();
  }

  let jsonRes = {
    error: responseErr.name,
    message: responseErr.message,
  };

  if (responseErr.errors) jsonRes.errors = responseErr.errors;

  // In some occasions like when invalid JSON is supplied `res.respond` might be not yet avalaible,
  // in this case we use the standard res.status(...).json(...)
  return res.respond ? res.respond(responseErr.httpCode, jsonRes) : res.status(responseErr.httpCode).json(jsonRes);
}