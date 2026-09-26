import type { Source } from "../types";
import { adzuna } from "./adzuna";
import { ashby } from "./ashby";
import { greenhouse } from "./greenhouse";
import { jooble } from "./jooble";
import { lever } from "./lever";
import { naukri } from "./naukri";
import { smartrecruiters } from "./smartrecruiters";

/** Every source sits behind the Source interface. API sources run first so a Naukri block never costs them. */
export const sources: Source[] = [greenhouse, lever, ashby, smartrecruiters, adzuna, jooble, naukri];
