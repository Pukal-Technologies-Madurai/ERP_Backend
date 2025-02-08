import sql from 'mssql';
import { dataFound, invalidInput, noData, servError } from '../../res.mjs'
import { checkIsNumber } from '../../helper_functions.mjs';


const TallyMasters = () => {
    
    const getTallyAndERPLOL = async (req, res) => {
        try {
            const tallyLOLRequest = new sql.Request(req.db)
                .query(`
                    SELECT 
                        Auto_Id,
                        Ledger_Tally_Id,
                        Ledger_Name,
                        Ledger_Alias,
                        Actual_Party_Name_with_Brokers,
                        Party_Name,
                        Party_Location,
                        Party_Nature,
                        Party_Group,
                        Ref_Brokers,
                        Ref_Owners,
                        Party_Mobile_1,
                        Party_Mobile_2,
                        Party_District,
                        File_No,
                        Date_Added,
                        A1
                    FROM tbl_Ledger_LOL
                    `
                ); 
            
            const ERPLOLRequest = new sql.Request()
                .query(`
                    SELECT	
                    	Auto_Id,
                        Ledger_Tally_Id,
                        Ledger_Name,
                        Ledger_Alias,
                        Actual_Party_Name_with_Brokers,
                        Party_Name,
                        Party_Location,
                        Party_Nature,
                        Party_Group,
                        Ref_Brokers,
                        Ref_Owners,
                        Party_Mobile_1,
                        Party_Mobile_2,
                        Party_District,
                        File_No,
                        Date_Added,
                        A1
                    FROM tbl_Ledger_LOL`
                );

            const tallyResult = await tallyLOLRequest;
            const ERPResult = await ERPLOLRequest;

            dataFound(res, ERPResult.recordset, 'dataFound', {
                tallyResult: tallyResult.recordset
            })
        } catch (e) {
            servError(e, res);
        }
    }

    const getTallyAndERPLOS = async (req, res) => {
        try {
            const tallyLOLRequest = new sql.Request(req.db)
                .query(`
                    SELECT 
                        *
                    FROM tbl_Stock_LOS
                    `
                ); 
            
            const ERPLOLRequest = new sql.Request()
                .query(`
                    SELECT 
                        *
                    FROM tbl_Stock_LOS`
                );

            const tallyResult = await tallyLOLRequest;
            const ERPResult = await ERPLOLRequest;

            dataFound(res, ERPResult.recordset, 'dataFound', {
                tallyResult: tallyResult.recordset
            })
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getTallyAndERPLOL,
        getTallyAndERPLOS,
    }
}

export default TallyMasters();