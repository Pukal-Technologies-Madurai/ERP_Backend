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

// export function servError(e, res, message = "Request Failed", others = {}) {
//     console.log(e);
//     return res.status(500).json({
//         data: [], message,
//         success: false,
//         others: { Error: e, ...others }
//     })
// }

export function servError(e, res, message = "Request Failed", others = {}) {
    const req = res.req;

    // Redact sensitive stuff
    const safeBody = { ...(req?.body ?? {}) };
    for (const k of ["password", "token", "otp"]) {
        if (k in safeBody) safeBody[k] = "[redacted]";
    }

    const mssqlInfo = {
        code: e.code,
        number: e.number ?? e?.originalError?.info?.number,
        lineNumber: e.lineNumber ?? e?.originalError?.info?.lineNumber,
        state: e.state ?? e?.originalError?.info?.state,
        class: e.class ?? e?.originalError?.info?.class,
        serverName: e.serverName ?? e?.originalError?.info?.serverName,
        procName: e.procName ?? e?.originalError?.info?.procName,
        message: e.message,
    };

    const durationMs = res.locals.startedAt
        ? Number(process.hrtime.bigint() - res.locals.startedAt) / 1e6
        : undefined;

    console.error({
        level: "error",
        msg: "request_failed",
        requestId: res.locals.requestId,
        method: req?.method,
        url: req?.originalUrl,
        baseUrl: req?.baseUrl,
        route: req?.route?.path || "",
        params: req?.params,
        query: req?.query,
        body: safeBody,
        sql: e?.sql,
        sqlParams: e?.sqlParams,
        mssql: mssqlInfo,
        stack: e.stack,
        actualError: e
    });

    return res.status(500).json({
        success: false,
        data: [],
        message,
        others: { ...others, requestId: res.locals.requestId, durationMs, Error: e },
    });
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