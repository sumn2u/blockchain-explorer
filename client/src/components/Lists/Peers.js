/**
 *    SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Container, Row, Col } from 'reactstrap';
import ReactTable from 'react-table';
import 'react-table/react-table.css';
import matchSorter from 'match-sorter';

const Peers = ({ peerList }) => {

    const columnHeaders = [
        {
          Header: "Peer Name",
          accessor: "server_hostname",
          filterMethod: (filter, rows) =>
            matchSorter(rows, filter.value, { keys: ["server_hostname"] }, { threshold: matchSorter.rankings.SIMPLEMATCH }),
          filterAll: true
        },
        {
          Header: "Request Url",
          accessor: "requests",
          filterMethod: (filter, rows) =>
          matchSorter(rows, filter.value, { keys: ["requests"] }, { threshold: matchSorter.rankings.SIMPLEMATCH }),
        filterAll: true
        }
      ];

    return (
        <div>
            <Row>
                <Col>
                    <div className="">
                         <ReactTable
                            data={peerList}
                            columns={columnHeaders}
                            defaultPageSize={5}
                            className="-striped -highlight"
                            filterable
                        />
                    </div>
                </Col>
            </Row>
        </div>
    );
};
export default Peers;
