import requests

resp = requests.get('https://www.baidu.com/',
                    verify=False,
                    proxies={
                        'http': 'http://127.0.0.1:8081',
                        'https': 'http://127.0.0.1:8081'
                    })
print(resp.status_code)
print(resp.headers)
print(resp.text)
