import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';


const baseGroupMaster = () => {

    const getBaseGroup = async (req, res) => {

        try {
            const result = (await new sql.Request().execute('Base_Group_VW')).recordset

            if (result.length > 0) {
                dataFound(res, result)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(res, e)
        }
    }

    const postBaseGroup = async (req, res) => {
        const { Base_Group_Name } = req.body;

        if (!Base_Group_Name) {
            return invalidInput(res, 'Base_Group_Name is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 1);
            request.input('Base_Group_Id', 0);
            request.input('Base_Group_Name', Base_Group_Name);

            const result = await request.execute('Base_Group_SP');

            if (result.recordset.length > 0) {
                success(res, 'Base Group Created')
            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const editBaseGroup = async (req, res) => {
        const { Base_Group_Id, Base_Group_Name } = req.body;

        if (!checkIsNumber(Base_Group_Id) || !Base_Group_Name) {
            return invalidInput(res, 'Base_Group_Id, Base_Group_Name is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 2);
            request.input('Base_Group_Id', Base_Group_Id);
            request.input('Base_Group_Name', Base_Group_Name);

            const result = await request.execute('Base_Group_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved!')
            } else {
                failed(res, 'Failed to save')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const deleteBaseGroup = async (req, res) => {
        const { Base_Group_Id } = req.body;

        if (!checkIsNumber(Base_Group_Id)) {
            return invalidInput(res, 'Base_Group_Id, is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 3);
            request.input('Base_Group_Id', Base_Group_Id);
            request.input('Base_Group_Name', 0);

            const result = await request.execute('Base_Group_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'Deleted')
            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }




    const stockGroup=async(req,res)=>{
        try {
    const { groupName = '' } = req.body;
  
    
    const result = await new sql.Request()  
      .input('Group_Name', sql.NVarChar(150), groupName)
      .execute('Item_Group_List');
      if (result.recordset.length > 0) {
                    dataFound(res, result.recordset)
                } else {
                    noData(res)
                }
    // res.json({ success: true, data: result.recordset });
  } catch (error) {
   servError(error,res)
  }
    }

    const stockItemGroup=async(req,res)=>{
         try {
    const { stockGroupId } = req.body;

    
    const result = await new sql.Request()
      .input('stock_group_id', sql.Int, stockGroupId || 0)
      .execute('Item_Group_Stock_Item_List');
    
     if (result.recordset.length > 0) {
                    dataFound(res, result.recordset)
                } else {
                    noData(res)
                }
  } catch (error) {
    servError(error,res)
  }
    }

    const stockItemGroupList=async(req,res)=>{
         try {
    const { fromDate, toDate, stockGroupId, itemIds = [] } = req.body;
    

    
    let itemFilter = '';
    if (itemIds.length > 0) {
      const itemList = itemIds.map(id => `'${id}'`).join(',');
      itemFilter = `AND S.Dest_Item_Id IN (${itemList}) AND S.Sour_Item_Id IN (${itemList})`;
    }
    
    const destinationQuery = `
      SELECT 
        SJ.PR_Id as stock_jou_id,
        SJ.PR_Inv_Id as journal_no,
        SJ.Process_date as stock_journal_date,
        S.PRD_Id as stock_journ_dest_id,
        S.Dest_Item_Id as destina_consumt_item_id,
        S.Dest_Goodown_Id as destina_consumt_goodown_id,
        S.Dest_Qty as destina_consumt_qty,
        S.Dest_Unit as destina_consumt_unit,
        COALESCE(S.Dest_Rate, 0) as destina_consumt_rate,
        COALESCE(S.Dest_Amt, 0) as destina_consumt_amt,
        ST.Product_Name as stock_item_name,
        G.Godown_Name as godown_name,
        'Destination' as transaction_type
      FROM tbl_Processing_Gen_Info SJ
      INNER JOIN tbl_Processing_Destin_Details S ON SJ.PR_Id = S.PR_Id
      INNER JOIN tbl_Product_Master ST ON S.Dest_Item_Id = ST.Product_Id
      INNER JOIN tbl_Godown_Master G ON S.Dest_Goodown_Id = G.Godown_Id
      CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
      WHERE S.Dest_Item_Id = IG.Materail_Id
        AND SJ.Process_date >= @fromDate
        AND SJ.Process_date <= @toDate
        ${itemIds.length > 0 ? 'AND S.Dest_Item_Id IN (' + itemIds.map(id => `'${id}'`).join(',') + ')' : ''}
    `;
    
    const sourceQuery = `
      SELECT 
        SJ.PR_Id as stock_jou_id,
        SJ.PR_Inv_Id as journal_no,
        SJ.Process_date as stock_journal_date,
        S.PRS_Id as stock_journ_sour_id,
        S.Sour_Item_Id AS source_consumt_item_id,
        S.Sour_Goodown_Id as source_consumt_goodown_id,
        S.Sour_Qty as source_consumt_qty,
        S.Sour_Unit as source_consumt_unit,
        COALESCE(S.Sour_Rate, 0) as source_consumt_rate,
        COALESCE(S.Sour_Amt, 0) as Source_consumt_amt,
        ST.Product_Name as stock_item_name,
        G.Godown_Name as godown_name,
        'Source' as transaction_type
      FROM tbl_Processing_Gen_Info SJ
      INNER JOIN tbl_Processing_Source_Details S ON SJ.PR_Id = S.PR_Id
      INNER JOIN tbl_Product_Master ST ON S.Sour_Item_Id = ST.Product_Id
      INNER JOIN tbl_Godown_Master G ON S.Sour_Goodown_Id = G.Godown_Id
      CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
      WHERE S.Sour_Item_Id = IG.Materail_Id
        AND SJ.Process_date >= @fromDate
        AND SJ.Process_date <= @toDate
        ${itemIds.length > 0 ? 'AND S.Sour_Item_Id IN (' + itemIds.map(id => `'${id}'`).join(',') + ')' : ''}
    `;
    
    const request = new sql.Request()
    .input('fromDate', sql.Date, fromDate)
    .input('toDate', sql.Date, toDate);
    
    const [destinationResult, sourceResult] = await Promise.all([
      request.query(destinationQuery),
      request.query(sourceQuery)
    ]);
    
    const allTransactions = [
      ...(destinationResult.recordset || []),
      ...(sourceResult.recordset || [])
    ];
    
    allTransactions.sort((a, b) => new Date(a.stock_journal_date) - new Date(b.stock_journal_date));
    
    res.json({ 
      success: true, 
      data: {
        source: sourceResult.recordset || [],
        destination: destinationResult.recordset || []
      }
    });
  } catch (error) {
    servError(error,res)
  }
    }

    const stockGroupGet=async(req,res)=>{
          try {
          const stock = (await new sql.Request()
                    .query(`
                       select distinct(Stock_Group)  from tbl_Stock_LOS
                            `)
                ).recordset;
                // AND
                // Company_id = @Comp
    
                if (stock.length > 0) {
                    dataFound(res, stock)
                } else {
                    noData(res)
                }
            } catch (e) {
                servError(e, res)
            }
        }

const arrivalList = async (req, res) => {
  try {
    const { fromDate, toDate, stockGroupId, itemIds = [] } = req.body;
    
    
    const request = await new sql.Request()
    .input('fromDate', sql.Date, fromDate)
    .input('toDate', sql.Date, toDate);
    
    let itemFilter = '';
    if (itemIds.length > 0) {
      const itemList = itemIds.map(id => `'${id}'`).join(',');
      itemFilter = `AND S.Product_Id IN (${itemList})`;
    }
    
    const arrivalQuery = `
      SELECT 
        S.Arr_Id as Id,
        S.Arrival_Date,
        S.Arr_Id,
        S.Product_Id,
        S.To_Location as Arrival_godown_id,
        S.QTY as Arr_qty,
        S.Units as Units,
        COALESCE(S.Gst_Rate, 0) as Rate,
        COALESCE(S.Taxable_Value, 0) as Taxable_Value,
        ST.Product_Name as stock_item_name,
        G.Godown_Name as godown_name
      FROM tbl_Trip_Arrival S
      INNER JOIN tbl_Product_Master ST ON S.Product_Id = ST.Product_Id
      INNER JOIN tbl_Godown_Master G ON S.To_Location = G.Godown_Id
      CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
      WHERE S.Product_Id = IG.Materail_Id
        AND S.Arrival_Date >= @fromDate
        AND S.Arrival_Date <= @toDate
        ${itemFilter}
      ORDER BY S.Arrival_Date DESC
    `;
    
    const result = await request.query(arrivalQuery);
    //  dataFound(res, result.recordset)
    if (result.recordset.length > 0) {
                    dataFound(res, result.recordset)
                } else {
                    noData(res)
                }
  } catch (error) {
    servError(error,res)
  }
};




    return {
        getBaseGroup,
        postBaseGroup,
        editBaseGroup,
        deleteBaseGroup,
        stockGroup,
        stockItemGroup,
        stockItemGroupList,
        stockGroupGet,
        arrivalList
    }
}

export default baseGroupMaster()