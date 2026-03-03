import sql from 'mssql';

export const alterHistory = ({
    alteredTable = '',
    rowIdField = '',
    userField = '',
    reason = ''
}) => {
    return async (req, res, next) => {
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            const alteredRowId = req.body[rowIdField];
            const alterBy = req.body[userField];
            const alterReason = req.body[reason];
            const alterId = Math.floor(Math.random() * 999999);

            const result = await new sql.Request(transaction)
                .input('alteredTable', sql.NVarChar, alteredTable)
                .input('alteredRowId', alteredRowId)
                .input('alterBy', sql.Int, alterBy)
                .input('alterAt', sql.DateTimeOffset, new Date())
                .input('alterId', sql.Int, alterId)
                .input('reason', sql.NVarChar, alterReason)
                .query(`
                    INSERT INTO tbl_Alteration_History (
                        alteredTable, alteredRowId, alterBy, alterAt, alterId, reason
                    )
                    OUTPUT INSERTED.id
                    VALUES (
                        @alteredTable, @alteredRowId, @alterBy, @alterAt, @alterId, @reason
                    );
                `);

            const insertedId = result.recordset[0].id;

            req.transaction = transaction;
            req.alterId = alterId;
            req.alterHistoryId = insertedId;

            next();

        } catch (err) {
            if (transaction._aborted !== true) {
                await transaction.rollback();
            }
            next(err);
        }
    };
};