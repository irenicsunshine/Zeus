import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

interface Component {
  type: string;
  serialNumber: string;
  tsnAtPeriod: string;
  csnAtPeriod: string;
  flightHours: string;
  flightCycles: string;
  utilReportStatus: string;
  asset_status: string;
  [key: string]: string;
}

interface LesseeAsset {
  name: string;
  serialNumber: string;
  registrationNumber: string;
  validation_status: string;
  report_status: string;
  obligation_status: string;
  components: Component[];
}

interface LesseeGroup {
  lesseeName: string;
  assets: LesseeAsset[];
}

export async function POST(req: NextRequest) {
  try {
    const { lessees, period, fileName } = (await req.json()) as {
      lessees: LesseeGroup[];
      period: string;
      fileName: string;
    };

    const sql = neon(process.env.DATABASE_URL!);

    // Create tables
    await sql`
      CREATE TABLE IF NOT EXISTS lessee_assets (
        id                  SERIAL PRIMARY KEY,
        period              VARCHAR(50)  NOT NULL,
        lessee_name         VARCHAR(255) NOT NULL,
        aircraft_name       VARCHAR(255),
        serial_number       VARCHAR(100),
        registration_number VARCHAR(100),
        obligation_status   VARCHAR(100),
        validation_status   VARCHAR(50) DEFAULT 'pending',
        report_status       VARCHAR(50) DEFAULT 'Not Started',
        file_name           VARCHAR(255),
        uploaded_at         TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS lessee_components (
        id                SERIAL PRIMARY KEY,
        asset_id          INTEGER REFERENCES lessee_assets(id) ON DELETE CASCADE,
        component_type    VARCHAR(100),
        serial_number     VARCHAR(100),
        tsn               VARCHAR(50),
        csn               VARCHAR(50),
        flight_hours      VARCHAR(50),
        flight_cycles     VARCHAR(50),
        util_report_status VARCHAR(50) DEFAULT 'Not Started',
        obligation_status VARCHAR(50)
      )
    `;

    // Clear existing data for this period
    await sql`
      DELETE FROM lessee_components
      WHERE asset_id IN (SELECT id FROM lessee_assets WHERE period = ${period})
    `;
    await sql`DELETE FROM lessee_assets WHERE period = ${period}`;

    let insertedAssets = 0;
    let insertedComponents = 0;

    for (const lessee of lessees) {
      for (const asset of lessee.assets) {
        const [row] = await sql`
          INSERT INTO lessee_assets
            (period, lessee_name, aircraft_name, serial_number, registration_number,
             obligation_status, validation_status, report_status, file_name)
          VALUES
            (${period}, ${lessee.lesseeName}, ${asset.name}, ${asset.serialNumber},
             ${asset.registrationNumber}, ${asset.obligation_status},
             ${asset.validation_status}, ${asset.report_status}, ${fileName})
          RETURNING id
        `;
        insertedAssets++;

        for (const comp of asset.components) {
          await sql`
            INSERT INTO lessee_components
              (asset_id, component_type, serial_number, tsn, csn,
               flight_hours, flight_cycles, util_report_status, obligation_status)
            VALUES
              (${row.id}, ${comp.type}, ${comp.serialNumber}, ${comp.tsnAtPeriod},
               ${comp.csnAtPeriod}, ${comp.flightHours}, ${comp.flightCycles},
               ${comp.utilReportStatus}, ${comp.asset_status})
          `;
          insertedComponents++;
        }
      }
    }

    return NextResponse.json({ success: true, insertedAssets, insertedComponents });
  } catch (err) {
    console.error("DB save error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
