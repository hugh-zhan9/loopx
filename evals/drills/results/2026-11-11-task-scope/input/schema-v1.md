# 解析结果 schema-v1
记录包含 order_id、currency、amount_decimal、source_row、errors。
amount_decimal为不经浮点转换的原十进制字符串；解析异常记录保留source_row但不参与核对。
