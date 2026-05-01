# NHANES Dataset Cache

This folder stores downloaded NHANES XPT files from CDC.

## Files (auto-downloaded on backend startup)

| File | Description |
|------|-------------|
| `DEMO_J.XPT` | 2017-2018 Demographics |
| `BMX_J.XPT`  | 2017-2018 Body Measurements |
| `DXX_J.XPT`  | 2017-2018 DEXA Body Fat |
| `DEMO_I.XPT` | 2015-2016 Demographics |
| `BMX_I.XPT`  | 2015-2016 Body Measurements |
| `DXX_I.XPT`  | 2015-2016 DEXA Body Fat |
| `DEMO_H.XPT` | 2013-2014 Demographics |
| `BMX_H.XPT`  | 2013-2014 Body Measurements |
| `DXX_H.XPT`  | 2013-2014 DEXA Body Fat |

## Note

Files are downloaded automatically the first time the backend starts with internet access.
If CDC servers are unreachable, the ML model falls back to 25,000 NHANES-calibrated synthetic samples.
The trained model is saved to `backend/model/bf_model.pkl`.

## Source

https://wwwn.cdc.gov/nchs/nhanes/
