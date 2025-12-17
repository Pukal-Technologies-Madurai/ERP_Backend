import { ZodError } from 'zod';

/**
 * Validates request body using a Zod schema
 * @param {import('zod').ZodSchema} schema
 * @param {*} data
 * @param {import('express').Response} res
 * @returns {* | null}
 */
export const validateBody = (schema, data, res) => {
    try {
        return schema.parse(data);
    } catch (e) {
        if (e instanceof ZodError) {
            res.status(400).json({
                success: false,
                message: 'Invalid input data',
                errors: e.issues.map(err => ({
                    path: err.path.join('.'),
                    message: err.message,
                })),
            });
            return null;
        }
        throw e;
    }
};
