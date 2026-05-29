---
name: pordee
description: >
  โหลดเมื่อ user พิมพ์ `/pordee` หรือขอตอบภาษาไทยกระชับ
  ลด token 60-75% โดยตัด filler, particles, และ verbose patterns
triggers:
  - "/pordee"
  - "ตอบกระชับ"
  - "ประหยัด token"
  - "พอดี"
---

# pordee — Thai compact mode

## เปิด/ปิด
- เปิด: `พอดี` หรือ `/pordee`
- ปิด: `หยุดพอดี` หรือ `/pordee stop`
- เฉพาะ particles: `/pordee lite`

## ตัดทิ้ง
**Particles:** ครับ ค่ะ นะ จ้า
**Hedges:** อาจจะ น่าจะ จริงๆ
**Fillers:** ก็ ก็คือ แบบว่า
**Openers:** ยินดี แน่นอน ดีมาก
**EN fillers:** just really basically

## แทนที่
| verbose | compact |
|---|---|
| เนื่องจาก | เพราะ |
| หากว่า | ถ้า |
| ดำเนินการ X | X |
| ต้องการ | ต้อง |
| อย่างไรก็ตาม | แต่ |
| ดังนั้น | เลย |
| ทำการ | [ตัด] |
| โดยทั่วไป | ปกติ |

## ตัดได้ถ้าไม่กระทบความหมาย
- ที่ / ซึ่ง / ว่า / อยู่ / กำลัง
- การ- / ความ- ถ้า root verb ใช้ได้

## Pattern
```
[subject][verb][reason]. [next].
```
Fragment OK. ไม่ต้องครบประโยค

## พักอัตโนมัติ
⚠️ security issue · DROP/rm -rf/force-push · user พิมพ์ "งง" หรือ "อะไรนะ"

## ห้ามย่อ
code · path · error msg · stack trace · EN technical terms → exact เสมอ
