import sql from 'mssql'
import { servError, sentData,failed,success } from '../../res.mjs';


const voucherGroup = () => {

    const getVoucherGroupDropdown = async (req, res) => {

        try {
            const group = (await new sql.Request()
                .query(`
                    SELECT *
                    FROM tbl_Voucher_Group;`
                )
            ).recordset;

            sentData(res, group);

        } catch (e) {
            servError(e, res)
        }
    }


const getVoucherGroup = async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT 
                vg.Voucher_Group_Id,
                vg.Group_Name,
                vd.Group_Type,
                vd.Voucher_Id,
                vt.Voucher_Type
            FROM [dbo].[tbl_Voucher_Group] vg
            LEFT JOIN [dbo].[tbl_Voucher_Group_Details] vd
                ON vg.Voucher_Group_Id = vd.Voucher_Group_Id
            LEFT JOIN [dbo].[tbl_Voucher_Type] vt
                ON vt.Vocher_Type_Id = vd.Voucher_Id   -- ✅ fixed typo: Vocher → Voucher
            ORDER BY vg.Voucher_Group_Id ASC
        `);
 
        const groupedMap = new Map();
 
        for (const row of result.recordset) {
            if (!groupedMap.has(row.Voucher_Group_Id)) {
                groupedMap.set(row.Voucher_Group_Id, {
                    Voucher_Group_Id: row.Voucher_Group_Id,
                     Group_Type:   row.Group_Type, 
                    Group_Name:       row.Group_Name,
           
                    details: [],
                });
            }
 
            if (row.Voucher_Id != null) {
                groupedMap.get(row.Voucher_Group_Id).details.push({
                    Voucher_Id:   row.Voucher_Id,
                     Group_Type:   row.Group_Type,   
                    Voucher_Type: row.Voucher_Type, 
                });
            }
        }
 
        const voucherGroups = Array.from(groupedMap.values());
 
        return res.status(200).json({
            success: true,
            message: 'Voucher groups fetched successfully',
            voucherGroups,
        });
 
    } catch (e) {
        servError(e, res);
    }
};


const getVoucherTypeDropdown = async (req, res) => {
    try {
        const result = await sql.query(`
              SELECT Vocher_Type_Id AS value, Voucher_Type AS label
            FROM [dbo].[tbl_Voucher_Type]
        `);

        return res.status(200).json({
            success: true,
            data: result.recordset,
        });

    } catch (e) {
        servError(e, res);
    }
};

const createVoucherGroup = async (req, res) => {
    let transaction = null;
    
    try {
        const { Group_Name, details } = req.body;
        
      
        transaction = new sql.Transaction();
        

        await transaction.begin();

       
        const maxIdResult = await new sql.Request(transaction)
            .query(`SELECT ISNULL(MAX(Voucher_Group_Id), 0) + 1 AS NextId FROM tbl_Voucher_Group`);
        
        const Voucher_Group_Id = maxIdResult.recordset[0].NextId;

      
        await new sql.Request(transaction)
            .input('Voucher_Group_Id', sql.Int, Voucher_Group_Id)
            .input('Group_Name', sql.NVarChar, Group_Name.trim())
            .query(`
                INSERT INTO tbl_Voucher_Group (Voucher_Group_Id, Group_Name)
                VALUES (@Voucher_Group_Id, @Group_Name)
            `);

      
        for (const detail of details) {
            await new sql.Request(transaction)
                .input('Voucher_Group_Id', sql.Int, Voucher_Group_Id)
                .input('Group_Type', sql.NVarChar, detail.Group_Type)
                .input('Voucher_Id', sql.Int, detail.Voucher_Id)
                .query(`
                    INSERT INTO tbl_Voucher_Group_Details (Voucher_Group_Id, Group_Type, Voucher_Id)
                    VALUES (@Voucher_Group_Id, @Group_Type, @Voucher_Id)
                `);
        }

       
        await transaction.commit();

        return success(res, 'Voucher group created successfully', {
            Voucher_Group_Id,
            Group_Name: Group_Name.trim(),
            total_details: details.length,
        });

    } catch (e) {
        console.error('Error in createVoucherGroup:', e);
         if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackErr) {
                console.error('Error during rollback:', rollbackErr);
            }
        }
        
        return servError(e, res);
    }
};


const updateVoucherGroup = async (req, res) => {
    try {
        const { Voucher_Group_Id, Group_Name, details } = req.body;

        if (!Voucher_Group_Id)
            return failed(res, 'Voucher Group ID is required');

        if (!Group_Name?.trim())
            return failed(res, 'Group name is required');

        if (!details || !Array.isArray(details) || details.length === 0)
            return failed(res, 'At least one voucher is required');

        const existsCheck = await new sql.Request()
            .input('Voucher_Group_Id', sql.Int, Voucher_Group_Id)
            .query(`SELECT Voucher_Group_Id FROM tbl_Voucher_Group WHERE Voucher_Group_Id = @Voucher_Group_Id`);

        if (existsCheck.recordset.length === 0)
            return failed(res, 'Voucher group not found');

        const dupCheck = await new sql.Request()
            .input('Group_Name',       sql.NVarChar, Group_Name.trim())
            .input('Voucher_Group_Id', sql.Int,      Voucher_Group_Id)
            .query(`
                SELECT Voucher_Group_Id FROM tbl_Voucher_Group
                WHERE Group_Name = @Group_Name
                  AND Voucher_Group_Id != @Voucher_Group_Id
            `);

        if (dupCheck.recordset.length > 0)
            return failed(res, 'Another voucher group with this name already exists');

        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
       
            await new sql.Request(transaction)
                .input('Voucher_Group_Id', sql.Int,      Voucher_Group_Id)
                .input('Group_Name',       sql.NVarChar, Group_Name.trim())
                .query(`
                    UPDATE tbl_Voucher_Group
                    SET Group_Name = @Group_Name
                    WHERE Voucher_Group_Id = @Voucher_Group_Id
                `);

         
            await new sql.Request(transaction)
                .input('Voucher_Group_Id', sql.Int, Voucher_Group_Id)
                .query(`DELETE FROM tbl_Voucher_Group_Details WHERE Voucher_Group_Id = @Voucher_Group_Id`);

            for (const detail of details) {
                await new sql.Request(transaction)
                    .input('Voucher_Group_Id', sql.Int,      Voucher_Group_Id)
                    .input('Group_Type',       sql.NVarChar, detail.Group_Type)
                    .input('Voucher_Id',       sql.Int,      detail.Voucher_Id)
                    .query(`
                        INSERT INTO tbl_Voucher_Group_Details (Voucher_Group_Id, Group_Type, Voucher_Id)
                        VALUES (@Voucher_Group_Id, @Group_Type, @Voucher_Id)
                    `);
            }

            await transaction.commit();

            return success(res, 'Voucher group updated successfully', {
                Voucher_Group_Id,
                Group_Name,
                total_details: details.length,
            });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (e) {
        servError(e, res);
    }
};



    return {
        getVoucherGroupDropdown,
        getVoucherGroup,
        getVoucherTypeDropdown,
        createVoucherGroup,
        updateVoucherGroup

    }
}

export default voucherGroup();