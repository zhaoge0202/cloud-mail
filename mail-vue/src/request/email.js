import http from '@/axios/index.js';

export function emailList(accountId, emailId, timeSort, size, type) {
    return http.get('/email/list', {params: {accountId, emailId, timeSort, size, type}})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

// 已废弃：自动刷新关闭后不应再调用；保留函数避免旧引用报错
export function emailLatest() {
    return Promise.resolve([])
}

export function emailDetail(emailId) {
    return http.get('/email/detail', {params: {emailId}})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

export function emailReadAll(accountId) {
    return http.put('/email/readAll', {accountId})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}
