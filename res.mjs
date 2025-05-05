export function success(res, message = 'Done!', data = [], others = {}) {
    return res.status(200).json({
        data, message,
        success: true,
        others: { ...others }
    });
}

export function dataFound(res, data = [], message = 'Data Found', others = {}) {
    return res.status(200).json({
        data, message,
        success: true,
        others: { ...others }
    });
}

export function noData(res, message = 'No data', others = {}) {
    return res.status(200).json({
        data: [], message,
        success: true, 
        others: { ...others } 
    })
}

export function failed(res, message = 'Something Went Wrong! Please Try Again', others = {}) {
    return res.status(400).json({
        data: [], message,
        success: false,
        others: { ...others }
    })
}

export function servError(e, res, message = "Request Failed", others = {}) {
    console.log(e);
    return res.status(500).json({
        data: [], message,
        success: false,
        others: { Error: e, ...others }
    })
}

export function invalidInput(res, message = 'Invalid request', others = {}) {
    return res.status(400).json({ 
        data: [], message, 
        success: false, 
        others: { ...others }
    })
}

export const sentData = (res, data = [], others = {}) => {
    if (data.length > 0) {
        dataFound(res, data, 'data found', others);
    } else {
        noData(res);
    }
} 