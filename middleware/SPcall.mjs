import sql from 'mssql';
import { isValidObject } from '../helper_functions.mjs';

const SPCall = async ({ SPName = '', spParamerters = {}, spTransaction = null }) => {
    try {
        const request = spTransaction ? new sql.Request(spTransaction) : new sql.Request();

        if (isValidObject(spParamerters)) {
            Object.entries(spParamerters).forEach(([key, value]) => {
                request.input(key, value);
            });
        }

        const result = await request.execute(SPName);

        return result;
    } catch (error) {
        console.error('Error executing stored procedure:', error);
        return null; 
    }
};

export default SPCall;
