import axios, { AxiosHeaders } from 'axios'
import type {
    AxiosInstance,
    AxiosResponse,
    AxiosRequestConfig,
} from 'axios'




export class HttpClient {
    private instance: AxiosInstance;

    constructor(baseURL: string = import.meta.env.VITE_API_URL || '/api',timeout: number = 15000) {
        this.instance = axios.create({ baseURL, timeout });
        this.setupInterceptors();
    }

    //设置请求和响应拦截器
    private setupInterceptors() {
        this.instance.interceptors.request.use(
            (config) => {
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );
    }

    // HTTP客户端类
    // 负责处理所有HTTP请求，包括自动菜单数据获取和权限检查
    //get请求
    public get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return this.instance.get(url, config);
    }
    //post请求
    public post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return this.instance.post(url, data, config);
    }
    //put请求
    public put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return this.instance.put(url, data, config);
    }
    //delete请求
    public delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        return this.instance.delete(url, config);
    }
}

