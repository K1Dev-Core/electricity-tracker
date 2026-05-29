# Task: Token Benchmark — rules vs no-rules

คุณคือ agent ที่กำลังทดสอบว่า rules ใน `.cursor/rules/` ลด token ได้จริงไหม
ทำตามขั้นตอนนี้แล้วเขียน report ลงไฟล์ `benchmark-report.md`

---

## ขั้นตอน

### 1. นับขนาด rules ที่โหลดทุก request
อ่านไฟล์ที่มี `alwaysApply: true` และนับ token โดยประมาณ (1 token ≈ 4 chars):
```
.cursor/rules/pordee-core.mdc
.cursor/rules/token-diet.mdc
```

### 2. นับขนาด rules ที่โหลดเฉพาะบางไฟล์
```
.cursor/rules/code-response.mdc  (globs: *.ts/*.js/…)
```

### 3. เปรียบเทียบ response length

ส่ง prompt เดิม 2 รอบ แล้วนับ chars ของ response:

**Prompt A (ทั่วไป):**
> "อธิบายว่า useState ใน React ทำงานยังไง"

**Prompt B (code):**
> "แก้ฟังก์ชันนี้ให้ handle null ด้วย: `const getName = (user) => user.name`"

สำหรับแต่ละ prompt:
- รอบ 1: ตอบโดย **ไม่มี** system rules (ตอบยาวตามปกติ)
- รอบ 2: ตอบโดย **ใช้** rules ที่โหลดอยู่จริง

นับ chars ของแต่ละ response

### 4. เขียน report

สร้างไฟล์ `benchmark-report.md` ที่ root ของ project:

```
# Token Benchmark Report
วันที่: <วันนี้>

## สรุป
<1-2 ประโยค>

## Rules overhead (input tokens ทุก request)
| ไฟล์ | chars | ~tokens |
|---|---|---|
| pordee-core.mdc | ... | ... |
| token-diet.mdc | ... | ... |
| รวม always-apply | ... | ... |
| code-response.mdc (conditional) | ... | ... |

## Output token savings
| Prompt | ไม่มี rules (chars) | มี rules (chars) | ลดได้ | % |
|---|---|---|---|---|
| Prompt A (ทั่วไป) | ... | ... | ... | ...% |
| Prompt B (code) | ... | ... | ... | ...% |

## ROI
input overhead: ~X tokens/request
output saving: ~Y tokens/request
คุ้มหลัง Z requests

## ข้อสังเกต
<สิ่งที่น่าสนใจ หรือ rule ไหนควรปรับ>
```

---

วิธีรัน: เปิด Cursor Agent แล้วพิมพ์
> `อ่านไฟล์ .cursor/tasks/benchmark-tokens.md แล้วทำตามขั้นตอนทุกอย่างในนั้น แล้วสร้างไฟล์ benchmark-report.md`
