import sql from 'mssql';
import dotenv from 'dotenv';
import { dataFound, failed, invalidInput, noData, servError, success } from '../../res.mjs';
import uploadFile from '../../middleware/uploadMiddleware.mjs';
import getImage from '../../middleware/getImageIfExist.mjs';
import fileRemoverMiddleware from '../../middleware/unSyncFile.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import SPCall from '../../middleware/SPcall.mjs';

dotenv.config();

const deleteCurrentProductImage = async (productId) => {
    const getImageQuery = `
        SELECT Product_Image_Path
        FROM tbl_Product_Master
        WHERE Product_Id = @productId`;

    const request = new sql.Request();
    request.input('productId', productId);
    const result = await request.query(getImageQuery);

    if (result.recordset.length > 0) {
        const imagePath = result.recordset[0].Product_Image_Path;
        if (imagePath) {
            fileRemoverMiddleware(imagePath)
                .catch((err) => {
                    console.error('Error deleting file:', err);
                });
        }
    }
};

const sfProductController = () => {

    const getProducts = async (req, res) => {
        const { IS_Sold = 1 } = req.query;

        try {

            const request = new sql.Request()
                .input('IS_Sold', IS_Sold)
                .query(`
                    SELECT 
                    	p.*,
                    	COALESCE(b.Brand_Name, 'NOT FOUND') AS Brand_Name,
                    	COALESCE(pg.Pro_Group, 'NOT FOUND') AS Pro_Group,
                        COALESCE(u.Units, 'NOT FOUND') AS Units,
                        COALESCE(pck.Pack, 'NOT FOUND') AS PackGet,
                        COALESCE((
                            SELECT 
                                TOP (1) Product_Rate 
                            FROM 
                                tbl_Pro_Rate_Master 
                            WHERE 
                                Product_Id = p.Product_Id
                            ORDER BY
                                CONVERT(DATETIME, Rate_Date) DESC
                        ), 0) AS Item_Rate
                    FROM 
                    	tbl_Product_Master AS p
                    	LEFT JOIN tbl_Brand_Master AS b
                    	ON b.Brand_Id = p.Brand
                    	LEFT JOIN tbl_Product_Group AS pg
                    	ON pg.Pro_Group_Id = p.Product_Group
                        LEFT JOIN tbl_UOM AS u
                        ON u.Unit_Id = p.UOM_Id
                        LEFT JOIN tbl_Pack_Master AS pck
                        ON pck.Pack_Id = p.Pack_Id
                    WHERE
                        IS_Sold = @IS_Sold`
                )

            const result = await request;

            if (result.recordset.length) {
                const withPic = result.recordset.map(o => ({
                    ...o,
                    productImageUrl: getImage('products', o?.Product_Image_Name)
                }));
                dataFound(res, withPic);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const productDropDown = async (req, res) => {

        try {

            const request = new sql.Request()
                .query(`
                    SELECT 
                    	p.Product_Id,
                        p.Product_Name,
                        p.ERP_Id,
                        p.Product_Image_Name,
                        p.UOM_Id,
                        u.Units
                    FROM 
                    	tbl_Product_Master AS p
                        LEFT JOIN tbl_UOM AS u
                        ON u.Unit_Id = p.UOM_Id`
                )

            const result = await request;

            if (result.recordset.length) {
                const withPic = result.recordset.map(o => ({
                    ...o,
                    productImageUrl: getImage('products', o?.Product_Image_Name)
                }));
                dataFound(res, withPic);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getGroupedProducts = async (req, res) => {
        const { IS_Sold = 1 } = req.query;

        try {
            const query = `
            WITH UOM AS (
                SELECT *
                FROM tbl_UOM
            ),
            RATE AS (
                SELECT * 
                FROM tbl_Pro_Rate_Master
            ),
            BRAND AS (
                SELECT *
                FROM tbl_Brand_Master
            ),
            PRODUCTGROUP AS (
                SELECT *
                FROM tbl_Product_Group
            ),
            PRODUCTS AS (
                SELECT 
                    p.*,
                    COALESCE(b.Brand_Name, 'NOT FOUND') AS Brand_Name,
            	    COALESCE(pg.Pro_Group, 'NOT FOUND') AS Pro_Group,
                    COALESCE(u.Units, 'NOT FOUND') AS Units,
                    COALESCE((
                        SELECT 
                            TOP (1) Product_Rate 
                        FROM 
                            RATE AS r
                        WHERE 
                            r.Product_Id = p.Product_Id
                        ORDER BY
                            CONVERT(DATETIME, r.Rate_Date) DESC
                    ), 0) AS Item_Rate 
                FROM 
                    tbl_Product_Master AS p
                    LEFT JOIN BRAND AS b
            	    ON b.Brand_Id = p.Brand
            	    LEFT JOIN PRODUCTGROUP AS pg
            	    ON pg.Pro_Group_Id = p.Product_Group
                    LEFT JOIN UOM AS u
                    ON u.Unit_Id = p.UOM_Id
                WHERE
                    p.IS_Sold = @IS_Sold
            )
            SELECT 
                g.*,
                COALESCE((
                    SELECT 
                        *
                    FROM 
                        PRODUCTS AS p
                    WHERE
                        g.Pro_Group_Id = p.Product_Group
                    FOR JSON PATH
                ), '[]') AS GroupedProductArray
            FROM
                tbl_Product_Group AS g
            WHERE
                g.Pro_Group_Id != 0 
            ORDER BY 
                g.Pro_Group_Id`;

            const request = new sql.Request()
                .input('IS_Sold', IS_Sold)
            const result = await request.query(query);

            if (result.recordset.length > 0) {

                const parsed = result.recordset.map(o => ({
                    ...o,
                    GroupedProductArray: JSON.parse(o?.GroupedProductArray)
                }))
                const withPic = parsed.map(o => ({
                    ...o,
                    GroupedProductArray: o?.GroupedProductArray?.map(oo => ({
                        ...oo,
                        productImageUrl: getImage('products', oo?.Product_Image_Name)
                    }))
                }));
                dataFound(res, withPic)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getProductGroups = async (req, res) => {

        try {
            const result = await new sql.Request()
                .query(`SELECT Pro_Group_Id, Pro_Group FROM tbl_Product_Group `);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getProductPacks = async (req, res) => {

        try {
            const result = await new sql.Request()
                .query(`SELECT Pack_Id, Pack FROM tbl_Pack_Master `);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const postProductsWithImage = async (req, res) => {

        try {
            await uploadFile(req, res, 0, 'Product_Image');
            const fileName = req?.file?.filename;
            const filePath = req?.file?.path;

            if (!fileName) {
                return invalidInput(res, 'Product Photo is required')
            }

            const {
                Product_Name, Short_Name, Product_Description, Brand = 0, Product_Group = 0, UOM_Id = 0,
                Pack_Id = 0, IS_Sold = 0, HSN_Code, Gst_P = 0, ERP_Id, Display_Order_By,Pos_Brand_Id,IsActive
            } = req.body;

            const getMaxId = await sql.query(`SELECT COALESCE(MAX(Product_Id), 0) AS MaxId FROM tbl_Product_Master`);

            const MaxId = getMaxId.recordset[0]?.MaxId || 1

            const request = new sql.Request()
                .input('Product_Id', MaxId)
                .input('Product_Code', 'ONLINE_' + MaxId)
                .input('Product_Name', Product_Name)
                .input('Short_Name', Short_Name)
                .input('Product_Description', Product_Description)
                .input('Brand', Brand)
                .input('Product_Group', Product_Group)
                .input('Pack_Id', Pack_Id)
                .input('UOM_Id', UOM_Id)
                .input('IS_Sold', IS_Sold)
                .input('Display_Order_By', Display_Order_By)
                .input('Product_Image_Name', fileName)
                .input('Product_Image_Path', filePath)
                .input('HSN_Code', HSN_Code)
                .input('Gst_P', Number(Gst_P) ?? 0)
                .input('Cgst_P', (Number(Gst_P) / 2) ?? 0)
                .input('Sgst_P', (Number(Gst_P) / 2) ?? 0)
                .input('Igst_P', Number(Gst_P) ?? 0)
                .input('ERP_Id', ERP_Id)
                .input('Pos_Brand_Id', Pos_Brand_Id)
                .input('IsActive', IsActive)
                .query(`
                    INSERT INTO tbl_Product_Master (
                        Product_Id, Product_Code, Product_Name, Short_Name, Product_Description, Brand, 
                        Product_Group, Pack_Id, UOM_Id, IS_Sold, Display_Order_By, Product_Image_Name,
                        Product_Image_Path, HSN_Code, Gst_P, Cgst_P, Sgst_P, Igst_P, ERP_Id,Pos_Brand_Id,IsActive
                    ) VALUES (
                        @Product_Id, @Product_Code, @Product_Name, @Short_Name, @Product_Description, @Brand, 
                        @Product_Group, @Pack_Id, @UOM_Id, @IS_Sold, @Display_Order_By, @Product_Image_Name, 
                        @Product_Image_Path, @HSN_Code, @Gst_P, @Cgst_P, @Sgst_P, @Igst_P, @ERP_Id.@Pos_Brand_Id,@IsActive
                    )`
                );

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                    const request2 = new sql.Request()
                  
                    const currentDateTime = new Date();
                    
                    const formattedDateTime = `${currentDateTime.getFullYear()}/${(currentDateTime.getMonth() + 1).toString().padStart(2, '0')}/${currentDateTime.getDate().toString().padStart(2, '0')} ${currentDateTime.getHours().toString().padStart(2, '0')}:${currentDateTime.getMinutes().toString().padStart(2, '0')}`;
                 
                    request2.input('Last_Update_Time', formattedDateTime); 
    
                   const updateQuery = `UPDATE tbl_POS_Table_Synch  SET Last_Update_Time = @Last_Update_Time 
                                         WHERE Sync_Table_Id = 3`;
                     
                     const updateResult = await request2.query(updateQuery);
               
                     success(res, 'New Product Added')
            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const postProductsWithoutImage = async (req, res) => {
        const {
            Product_Name, Short_Name, Product_Description, Brand = 0, Product_Group = 0, UOM_Id = 0,
            Pack_Id = 0, IS_Sold = 0, HSN_Code, Gst_P = 0, ERP_Id, Display_Order_By,Pos_Brand_Id,IsActive
        } = req?.body;

        try {

            const getId = await getNextId({
                table: 'tbl_Product_Master',
                column: 'Product_Id'
            })

            if (!getId.status) {
                return failed(res, 'Failed to save, Please try again')
            }

            console.log(getId)

            const Product_Id = getId.MaxId

            const request = new sql.Request()
                .input('Product_Id', Product_Id)
                .input('Product_Code', 'ONLINE_' + Product_Id)
                .input('Product_Name', Product_Name)
                .input('Short_Name', Short_Name)
                .input('Product_Description', Product_Description)
                .input('Brand', Brand)
                .input('Product_Group', Product_Group)
                .input('Pack_Id', Pack_Id)
                .input('UOM_Id', UOM_Id)
                .input('IS_Sold', IS_Sold)
                .input('Display_Order_By', Display_Order_By)
                .input('Product_Image_Name', '')
                .input('Product_Image_Path', '')
                .input('HSN_Code', HSN_Code)
                .input('Gst_P', Number(Gst_P) ?? 0)
                .input('Cgst_P', (Number(Gst_P) / 2) ?? 0)
                .input('Sgst_P', (Number(Gst_P) / 2) ?? 0)
                .input('Igst_P', Number(Gst_P) ?? 0)
                .input('ERP_Id', ERP_Id)
                .input('Pos_Brand_Id', Pos_Brand_Id)
                .input('IsActive', IsActive)
                .query(`
                    INSERT INTO tbl_Product_Master (
                        Product_Id, Product_Code, Product_Name, Short_Name, Product_Description, Brand, 
                        Product_Group, Pack_Id, UOM_Id, IS_Sold, Display_Order_By, Product_Image_Name,
                        Product_Image_Path, HSN_Code, Gst_P, Cgst_P, Sgst_P, Igst_P, ERP_Id,Pos_Brand_Id,IsActive
                    ) VALUES (
                        @Product_Id, @Product_Code, @Product_Name, @Short_Name, @Product_Description, @Brand, 
                        @Product_Group, @Pack_Id, @UOM_Id, @IS_Sold, @Display_Order_By, @Product_Image_Name, 
                        @Product_Image_Path, @HSN_Code, @Gst_P, @Cgst_P, @Sgst_P, @Igst_P, @ERP_Id,@Pos_Brand_Id,@IsActive
                    )`
                );

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
              
                const request2 = new sql.Request()
               
                const currentDateTime = new Date();
               
                const formattedDateTime = `${currentDateTime.getFullYear()}/${(currentDateTime.getMonth() + 1).toString().padStart(2, '0')}/${currentDateTime.getDate().toString().padStart(2, '0')} ${currentDateTime.getHours().toString().padStart(2, '0')}:${currentDateTime.getMinutes().toString().padStart(2, '0')}`;
               
                request2.input('Last_Update_Time', formattedDateTime); 
    
                const updateQuery = `UPDATE tbl_POS_Table_Synch  SET Last_Update_Time = @Last_Update_Time 
                                       WHERE Sync_Table_Id = 3`;
                           const updateResult = await request2.query(updateQuery);

                           success(res, 'New Product Added')
            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const updateProduct = async (req, res) => {
        try {
            const {
                Product_Id, Product_Name, Short_Name, Product_Description, Brand = 0, Product_Group = 0, UOM_Id = 0,
                Pack_Id = 0, IS_Sold = 0, HSN_Code, Gst_P = 0, ERP_Id, Display_Order_By,Pos_Brand_Id,IsActive
            } = req?.body;

            if (!Product_Id) {
                return invalidInput(res, 'Product Id is required for update');
            }

            const request = new sql.Request()
                .input('Product_Id', Product_Id)
                .input('Product_Name', Product_Name)
                .input('Short_Name', Short_Name)
                .input('Product_Description', Product_Description)
                .input('Brand', Brand)
                .input('Product_Group', Product_Group)
                .input('Pack_Id', Pack_Id)
                .input('UOM_Id', UOM_Id)
                .input('IS_Sold', IS_Sold)
                .input('Display_Order_By', Display_Order_By)
                .input('HSN_Code', HSN_Code)
                .input('Gst_P', Number(Gst_P) ?? 0)
                .input('Cgst_P', (Number(Gst_P) / 2) ?? 0)
                .input('Sgst_P', (Number(Gst_P) / 2) ?? 0)
                .input('Igst_P', Number(Gst_P) ?? 0)
                .input('ERP_Id', ERP_Id)
                .input('Pos_Brand_Id', Pos_Brand_Id)
                .input('IsActive', IsActive)
                .query(`
                    UPDATE tbl_Product_Master
                    SET 
                        Product_Name = @Product_Name,
                        Short_Name = @Short_Name,
                        Product_Description = @Product_Description,
                        Brand = @Brand,
                        Product_Group = @Product_Group,
                        Pack_Id = @Pack_Id,
                        UOM_Id = @UOM_Id,
                        IS_Sold = @IS_Sold,
                        Display_Order_By = @Display_Order_By,
                        HSN_Code = @HSN_Code,
                        Gst_P = @Gst_P,
                        Cgst_P = @Cgst_P,
                        Sgst_P = @Sgst_P,
                        Igst_P = @Igst_P,
                        ERP_Id = @ERP_Id,
                          Pos_Brand_Id = @Pos_Brand_Id,
                            IsActive = @IsActive
                    WHERE Product_Id = @Product_Id`
                );

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                    const request2 = new sql.Request()
             
                    const currentDateTime = new Date();
               
                    const formattedDateTime = `${currentDateTime.getFullYear()}/${(currentDateTime.getMonth() + 1).toString().padStart(2, '0')}/${currentDateTime.getDate().toString().padStart(2, '0')} ${currentDateTime.getHours().toString().padStart(2, '0')}:${currentDateTime.getMinutes().toString().padStart(2, '0')}`;
               
                    request2.input('Last_Update_Time', formattedDateTime); 
     
                    const updateQuery = `UPDATE tbl_POS_Table_Synch   SET Last_Update_Time = @Last_Update_Time 
                                           WHERE Sync_Table_Id = 3`;
                   const updateResult = await request2.query(updateQuery);
                
                   success(res, 'Product updated successfully');
            } else {
                failed(res, 'Failed to update product');
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const updateProductImages = async (req, res) => {
        try {
            await uploadFile(req, res, 0, 'Product_Image');
            const fileName = req?.file?.filename;
            const filePath = req?.file?.path;

            if (!fileName) {
                return invalidInput(res, 'Product Photo is required')
            }

            const { Product_Id } = req.body;

            if (!checkIsNumber(Product_Id)) {
                return invalidInput(res, 'Product_Id is required');
            }

            await deleteCurrentProductImage(Product_Id)

            const request = new sql.Request()
                .input('img_name', fileName)
                .input('img_path', filePath)
                .input('Product_Id', Product_Id)
                .query(`
                    UPDATE 
                        tbl_Product_Master
                    SET 
                        Product_Image_Name = @img_name,
                        Product_Image_Type = @img_type
                    WHERE Product_Id = @Product_Id`
                )

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                    const request2 = new sql.Request()
             
                    const currentDateTime = new Date();
              
                    const formattedDateTime = `${currentDateTime.getFullYear()}/${(currentDateTime.getMonth() + 1).toString().padStart(2, '0')}/${currentDateTime.getDate().toString().padStart(2, '0')} ${currentDateTime.getHours().toString().padStart(2, '0')}:${currentDateTime.getMinutes().toString().padStart(2, '0')}`;
              
                    request2.input('Last_Update_Time', formattedDateTime); 
    
                   const updateQuery = `UPDATE tbl_POS_Table_Synch   SET Last_Update_Time = @Last_Update_Time 
                                  WHERE Sync_Table_Id = 3`;
                const updateResult = await request2.query(updateQuery);
                success(res, 'Product image updated successfully');
            } else {
                failed(res, 'Failed to update product image');
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const syncTallyLOS = async (req, res) => {
        try {
            await SPCall({ SPName: 'Product_Sync' });
            success(res, 'Sync success')
        } catch (e) {
            servError(e, res);
        }
    }


    return {
        getProducts,
        productDropDown,
        getGroupedProducts,
        getProductGroups,
        getProductPacks,
        postProductsWithImage,
        postProductsWithoutImage,
        updateProduct,
        updateProductImages,
        syncTallyLOS
    }
}

export default sfProductController();